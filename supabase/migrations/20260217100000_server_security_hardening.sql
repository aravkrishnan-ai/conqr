-- Server-side security hardening migration
-- Applied to production via Supabase Management API on 2026-02-17
-- ========================================

-- ========================================
-- 1. Create admin_users table (replaces hardcoded email checks)
-- ========================================
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read admin_users"
    ON public.admin_users FOR SELECT
    USING (auth.role() = 'authenticated');

-- Seed the dev user as admin
INSERT INTO public.admin_users (user_id)
VALUES ('b4248f26-a283-4c28-89bf-712b1b214bf8')
ON CONFLICT (user_id) DO NOTHING;

-- ========================================
-- 2. Update app_settings policies to use admin_users table
-- ========================================
DROP POLICY IF EXISTS "Only dev can insert settings" ON public.app_settings;
CREATE POLICY "Only admins can insert settings"
    ON public.app_settings FOR INSERT
    WITH CHECK (
        auth.uid() IN (SELECT user_id FROM public.admin_users)
    );

DROP POLICY IF EXISTS "Only dev can update settings" ON public.app_settings;
CREATE POLICY "Only admins can update settings"
    ON public.app_settings FOR UPDATE
    USING (
        auth.uid() IN (SELECT user_id FROM public.admin_users)
    )
    WITH CHECK (
        auth.uid() IN (SELECT user_id FROM public.admin_users)
    );

DROP POLICY IF EXISTS "Only dev can delete settings" ON public.app_settings;
CREATE POLICY "Only admins can delete settings"
    ON public.app_settings FOR DELETE
    USING (
        auth.uid() IN (SELECT user_id FROM public.admin_users)
    );

-- ========================================
-- 3. Update toggle_event_mode to use admin_users table
-- ========================================
CREATE OR REPLACE FUNCTION public.toggle_event_mode(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: admin access required';
    END IF;

    INSERT INTO public.app_settings (key, value)
    VALUES ('event_mode', to_jsonb(p_enabled))
    ON CONFLICT (key) DO UPDATE SET value = to_jsonb(p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_event_mode(boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.toggle_event_mode(boolean) TO authenticated;

-- ========================================
-- 4. Harden conquer_territory: validate modified/deleted territory ownership
-- ========================================
CREATE OR REPLACE FUNCTION public.conquer_territory(
    p_new_territory_id uuid,
    p_owner_id uuid,
    p_owner_username text,
    p_activity_id uuid,
    p_name text,
    p_claimed_at timestamptz,
    p_area float,
    p_perimeter float,
    p_center jsonb,
    p_polygon jsonb,
    p_history jsonb,
    p_modified_territories jsonb DEFAULT '[]'::jsonb,
    p_deleted_territory_ids uuid[] DEFAULT '{}'::uuid[],
    p_invasions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    mod_territory jsonb;
    invasion jsonb;
    del_id uuid;
    last_claim timestamptz;
    polygon_length int;
    center_lat float;
    center_lng float;
    mod_id uuid;
    existing_count int;
    del_owner uuid;
    mod_owner uuid;
    inv_territory_owner uuid;
BEGIN
    -- === Authorization ===
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: can only conquer territories as yourself';
    END IF;

    -- === Rate limiting: max 1 territory claim per 30 seconds ===
    SELECT MAX(claimed_at) INTO last_claim
    FROM public.territories
    WHERE owner_id = auth.uid();

    IF last_claim IS NOT NULL AND (now() - last_claim) < interval '30 seconds' THEN
        RAISE EXCEPTION 'Rate limited: wait at least 30 seconds between territory claims';
    END IF;

    -- === Input validation: area ===
    IF p_area IS NULL OR p_area < 0 THEN
        RAISE EXCEPTION 'Invalid area: must be non-negative';
    END IF;

    IF p_area > 10000000 THEN
        RAISE EXCEPTION 'Invalid area: exceeds maximum of 10 km²';
    END IF;

    -- === Input validation: perimeter ===
    IF p_perimeter IS NOT NULL AND p_perimeter < 0 THEN
        RAISE EXCEPTION 'Invalid perimeter: must be non-negative';
    END IF;

    IF p_perimeter IS NOT NULL AND p_perimeter > 100000 THEN
        RAISE EXCEPTION 'Invalid perimeter: exceeds maximum of 100 km';
    END IF;

    -- === Input validation: polygon ===
    IF p_polygon IS NULL OR jsonb_typeof(p_polygon) != 'array' THEN
        RAISE EXCEPTION 'Invalid polygon: must be a JSON array';
    END IF;

    polygon_length := jsonb_array_length(p_polygon);
    IF polygon_length < 3 THEN
        RAISE EXCEPTION 'Invalid polygon: must have at least 3 points';
    END IF;

    IF polygon_length > 50000 THEN
        RAISE EXCEPTION 'Invalid polygon: too many points (max 50000)';
    END IF;

    -- === Input validation: center coordinates ===
    IF p_center IS NULL OR jsonb_typeof(p_center) != 'object' THEN
        RAISE EXCEPTION 'Invalid center: must be a JSON object with lat/lng';
    END IF;

    center_lat := (p_center->>'lat')::float;
    center_lng := (p_center->>'lng')::float;

    IF center_lat IS NULL OR center_lat < -90 OR center_lat > 90 THEN
        RAISE EXCEPTION 'Invalid center latitude: must be between -90 and 90';
    END IF;

    IF center_lng IS NULL OR center_lng < -180 OR center_lng > 180 THEN
        RAISE EXCEPTION 'Invalid center longitude: must be between -180 and 180';
    END IF;

    -- === Validate modified territories: must exist and NOT belong to caller ===
    IF jsonb_array_length(p_modified_territories) > 0 THEN
        FOR mod_territory IN SELECT * FROM jsonb_array_elements(p_modified_territories)
        LOOP
            mod_id := (mod_territory->>'id')::uuid;
            SELECT owner_id INTO mod_owner FROM public.territories WHERE id = mod_id;
            IF mod_owner IS NULL THEN
                RAISE EXCEPTION 'Modified territory % does not exist', mod_id;
            END IF;
            IF mod_owner = auth.uid() THEN
                RAISE EXCEPTION 'Cannot modify your own territory % during conquering', mod_id;
            END IF;
        END LOOP;
    END IF;

    -- === Validate deleted territories: must exist and NOT belong to caller ===
    IF array_length(p_deleted_territory_ids, 1) IS NOT NULL THEN
        FOREACH del_id IN ARRAY p_deleted_territory_ids
        LOOP
            SELECT owner_id INTO del_owner FROM public.territories WHERE id = del_id;
            IF del_owner IS NULL THEN
                RAISE EXCEPTION 'Deleted territory % does not exist', del_id;
            END IF;
            IF del_owner = auth.uid() THEN
                RAISE EXCEPTION 'Cannot delete your own territory % during conquering', del_id;
            END IF;
        END LOOP;
    END IF;

    -- === Input validation: modified territory area can only shrink ===
    IF jsonb_array_length(p_modified_territories) > 0 THEN
        FOR mod_territory IN SELECT * FROM jsonb_array_elements(p_modified_territories)
        LOOP
            mod_id := (mod_territory->>'id')::uuid;
            DECLARE
                current_area float;
                new_area float;
            BEGIN
                SELECT area INTO current_area FROM public.territories WHERE id = mod_id;
                new_area := (mod_territory->>'area')::float;
                IF new_area IS NOT NULL AND current_area IS NOT NULL AND new_area > current_area THEN
                    RAISE EXCEPTION 'Territory % area can only shrink during conquering, not grow (% > %)', mod_id, new_area, current_area;
                END IF;
            END;
        END LOOP;
    END IF;

    -- === Validate invasions: invader must be caller, invaded_user_id must own the invaded territory ===
    IF jsonb_array_length(p_invasions) > 0 THEN
        FOR invasion IN SELECT * FROM jsonb_array_elements(p_invasions)
        LOOP
            IF (invasion->>'invader_user_id')::uuid != auth.uid() THEN
                RAISE EXCEPTION 'Invasion invader_user_id must match the authenticated user';
            END IF;
            IF (invasion->>'new_territory_id')::uuid != p_new_territory_id THEN
                RAISE EXCEPTION 'Invasion new_territory_id must match the territory being created';
            END IF;
            -- Validate that invaded_user_id actually owns the invaded territory
            SELECT owner_id INTO inv_territory_owner
            FROM public.territories
            WHERE id = (invasion->>'invaded_territory_id')::uuid;
            IF inv_territory_owner IS NULL THEN
                RAISE EXCEPTION 'Invaded territory does not exist';
            END IF;
            IF inv_territory_owner != (invasion->>'invaded_user_id')::uuid THEN
                RAISE EXCEPTION 'invaded_user_id does not match actual territory owner';
            END IF;
        END LOOP;
    END IF;

    -- === Insert the new territory ===
    INSERT INTO public.territories (id, owner_id, name, activity_id, claimed_at, area, perimeter, center, polygon, history)
    VALUES (p_new_territory_id, p_owner_id, p_name, p_activity_id, p_claimed_at, p_area, p_perimeter, p_center, p_polygon, p_history);

    -- === Update modified (shrunk) territories ===
    FOR mod_territory IN SELECT * FROM jsonb_array_elements(p_modified_territories)
    LOOP
        UPDATE public.territories
        SET polygon = (mod_territory->>'polygon')::jsonb,
            area = (mod_territory->>'area')::float,
            perimeter = (mod_territory->>'perimeter')::float,
            center = (mod_territory->>'center')::jsonb,
            history = (mod_territory->>'history')::jsonb
        WHERE id = (mod_territory->>'id')::uuid;
    END LOOP;

    -- === Delete fully consumed territories ===
    FOREACH del_id IN ARRAY p_deleted_territory_ids
    LOOP
        DELETE FROM public.territories WHERE id = del_id;
    END LOOP;

    -- === Insert invasion notifications ===
    FOR invasion IN SELECT * FROM jsonb_array_elements(p_invasions)
    LOOP
        INSERT INTO public.territory_invasions (
            invaded_user_id, invader_user_id, invader_username,
            invaded_territory_id, new_territory_id,
            overlap_area, territory_was_destroyed
        ) VALUES (
            (invasion->>'invaded_user_id')::uuid,
            (invasion->>'invader_user_id')::uuid,
            invasion->>'invader_username',
            (invasion->>'invaded_territory_id')::uuid,
            (invasion->>'new_territory_id')::uuid,
            (invasion->>'overlap_area')::float,
            COALESCE((invasion->>'territory_was_destroyed')::boolean, false)
        );
    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.conquer_territory(uuid, uuid, text, uuid, text, timestamptz, float, float, jsonb, jsonb, jsonb, jsonb, uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.conquer_territory(uuid, uuid, text, uuid, text, timestamptz, float, float, jsonb, jsonb, jsonb, jsonb, uuid[], jsonb) TO authenticated;

-- ========================================
-- 5. Fix get_user_activities: strip polylines for non-owner callers
-- ========================================
CREATE OR REPLACE FUNCTION public.get_user_activities(target_user_id uuid)
RETURNS SETOF public.activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() = target_user_id THEN
        -- Owner sees everything
        RETURN QUERY
        SELECT * FROM public.activities
        WHERE user_id = target_user_id
        ORDER BY start_time DESC;
    ELSE
        -- Others see activities but with polylines stripped for privacy
        RETURN QUERY
        SELECT
            id, user_id, type, start_time, end_time,
            distance, duration,
            '[]'::jsonb AS polylines,
            is_synced, territory_id, average_speed
        FROM public.activities
        WHERE user_id = target_user_id
        ORDER BY start_time DESC;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_activities(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_activities(uuid) TO authenticated;

-- ========================================
-- 6. Create join_event RPC with atomic participant cap enforcement
-- ========================================
CREATE OR REPLACE FUNCTION public.join_event(
    p_event_id text,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_key text;
    v_prefix text;
    v_count int;
    v_max_participants int := 100;
    v_event_value jsonb;
    v_duration_minutes int;
    v_started_at timestamptz;
    v_end_time timestamptz;
BEGIN
    -- Auth check
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: can only join as yourself';
    END IF;

    -- Acquire advisory lock on event to serialize joins
    PERFORM pg_advisory_xact_lock(hashtext(p_event_id));

    -- Verify event is active
    SELECT value INTO v_event_value
    FROM public.app_settings
    WHERE key = 'current_event';

    IF v_event_value IS NULL OR v_event_value = 'null'::jsonb THEN
        RAISE EXCEPTION 'Event not found or has ended';
    END IF;

    IF v_event_value->>'id' != p_event_id THEN
        RAISE EXCEPTION 'Event not found or has ended';
    END IF;

    -- Check if event has expired
    v_duration_minutes := (v_event_value->>'durationMinutes')::int;
    v_started_at := (v_event_value->>'startedAt')::timestamptz;
    IF v_duration_minutes IS NOT NULL AND v_started_at IS NOT NULL THEN
        v_end_time := v_started_at + (v_duration_minutes || ' minutes')::interval;
        IF now() > v_end_time THEN
            RAISE EXCEPTION 'Event has ended';
        END IF;
    END IF;

    -- Check participant count
    v_prefix := 'event_join:' || p_event_id || ':';
    SELECT COUNT(*) INTO v_count
    FROM public.app_settings
    WHERE key LIKE v_prefix || '%';

    IF v_count >= v_max_participants THEN
        RAISE EXCEPTION 'Event is full (% participants max)', v_max_participants;
    END IF;

    -- Upsert participant row
    v_key := v_prefix || p_user_id::text;
    INSERT INTO public.app_settings (key, value)
    VALUES (v_key, jsonb_build_object('joined_at', now()))
    ON CONFLICT (key) DO NOTHING;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.join_event(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_event(text, uuid) TO authenticated;
