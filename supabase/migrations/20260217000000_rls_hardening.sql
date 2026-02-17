-- RLS Hardening & DB Constraints Migration
-- Fixes remaining security audit findings before Play Store submission
-- ========================================

-- ========================================
-- 1. Territory INSERT policy: enforce owner_id = auth.uid()
-- ========================================
DROP POLICY IF EXISTS "Authenticated users can create territories" ON public.territories;
CREATE POLICY "Authenticated users can create territories"
    ON public.territories FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

-- ========================================
-- 2. Friendships UPDATE policy: add WITH CHECK to prevent column tampering
-- ========================================
DROP POLICY IF EXISTS "Addressees can respond to requests" ON public.friendships;
CREATE POLICY "Addressees can respond to requests"
    ON public.friendships FOR UPDATE
    USING (auth.uid() = addressee_id)
    WITH CHECK (
        auth.uid() = addressee_id
        AND requester_id = requester_id  -- cannot change requester
        AND addressee_id = addressee_id  -- cannot change addressee
    );

-- ========================================
-- 3. Post comments UPDATE policy: add WITH CHECK to prevent column tampering
-- ========================================
DROP POLICY IF EXISTS "Users can update own comments" ON public.post_comments;
CREATE POLICY "Users can update own comments"
    ON public.post_comments FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 4. Users: add DELETE policy for account deletion
-- ========================================
DROP POLICY IF EXISTS "Users can delete own profile" ON public.users;
CREATE POLICY "Users can delete own profile"
    ON public.users FOR DELETE
    USING (auth.uid() = id);

-- ========================================
-- 5. Analytics events: add DELETE policy for own data
-- ========================================
DROP POLICY IF EXISTS "Users can delete own analytics" ON public.analytics_events;
CREATE POLICY "Users can delete own analytics"
    ON public.analytics_events FOR DELETE
    USING (auth.uid() = user_id);

-- ========================================
-- 6. App settings: add INSERT/DELETE policies for dev user only
-- ========================================
DROP POLICY IF EXISTS "Only dev can insert settings" ON public.app_settings;
CREATE POLICY "Only dev can insert settings"
    ON public.app_settings FOR INSERT
    WITH CHECK (
        auth.uid() = (
            SELECT id FROM public.users
            WHERE email = 'arav_krishnan@ug29.mesaschool.co'
            LIMIT 1
        )
    );

DROP POLICY IF EXISTS "Only dev can delete settings" ON public.app_settings;
CREATE POLICY "Only dev can delete settings"
    ON public.app_settings FOR DELETE
    USING (
        auth.uid() = (
            SELECT id FROM public.users
            WHERE email = 'arav_krishnan@ug29.mesaschool.co'
            LIMIT 1
        )
    );

-- ========================================
-- 7. DB length constraints on user-generated content
-- ========================================
ALTER TABLE public.users
    ADD CONSTRAINT users_bio_length CHECK (char_length(bio) <= 500);

ALTER TABLE public.users
    ADD CONSTRAINT users_username_length CHECK (char_length(username) <= 50);

ALTER TABLE public.posts
    ADD CONSTRAINT posts_content_length CHECK (char_length(content) <= 5000);

ALTER TABLE public.post_comments
    ADD CONSTRAINT post_comments_content_length CHECK (char_length(content) <= 2000);

ALTER TABLE public.territories
    ADD CONSTRAINT territories_name_length CHECK (char_length(name) <= 100);

-- ========================================
-- 8. Cap get_leaderboard p_limit to prevent abuse
-- ========================================
CREATE OR REPLACE FUNCTION public.get_leaderboard(
    p_since timestamptz DEFAULT NULL,
    p_limit int DEFAULT 50
)
RETURNS TABLE(
    user_id uuid,
    username text,
    avatar_url text,
    total_area float,
    territory_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Cap limit to 500 to prevent abuse
    IF p_limit IS NULL OR p_limit < 1 THEN
        p_limit := 50;
    ELSIF p_limit > 500 THEN
        p_limit := 500;
    END IF;

    RETURN QUERY
    SELECT
        t.owner_id AS user_id,
        u.username,
        u.avatar_url,
        COALESCE(SUM(t.area), 0)::float AS total_area,
        COUNT(t.id) AS territory_count
    FROM public.territories t
    JOIN public.users u ON u.id = t.owner_id
    WHERE (p_since IS NULL OR t.claimed_at >= p_since)
    GROUP BY t.owner_id, u.username, u.avatar_url
    ORDER BY total_area DESC
    LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard(timestamptz, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(timestamptz, int) TO authenticated;

-- ========================================
-- 9. Harden conquer_territory: validate ownership of modified/deleted territories
--    and validate invasion payloads reference the caller
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

    -- === Input validation: modified territories must exist AND not belong to caller ===
    -- (Conquering shrinks OTHER users' territories, not your own)
    IF jsonb_array_length(p_modified_territories) > 0 THEN
        FOR mod_territory IN SELECT * FROM jsonb_array_elements(p_modified_territories)
        LOOP
            mod_id := (mod_territory->>'id')::uuid;
            SELECT owner_id INTO mod_owner FROM public.territories WHERE id = mod_id;
            IF mod_owner IS NULL THEN
                RAISE EXCEPTION 'Modified territory % does not exist', mod_id;
            END IF;
        END LOOP;
    END IF;

    -- === Input validation: deleted territories must exist ===
    IF array_length(p_deleted_territory_ids, 1) IS NOT NULL THEN
        FOREACH del_id IN ARRAY p_deleted_territory_ids
        LOOP
            SELECT owner_id INTO del_owner FROM public.territories WHERE id = del_id;
            IF del_owner IS NULL THEN
                RAISE EXCEPTION 'Deleted territory % does not exist', del_id;
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

    -- === Input validation: invasion payloads must reference the caller as invader ===
    IF jsonb_array_length(p_invasions) > 0 THEN
        FOR invasion IN SELECT * FROM jsonb_array_elements(p_invasions)
        LOOP
            IF (invasion->>'invader_user_id')::uuid != auth.uid() THEN
                RAISE EXCEPTION 'Invasion invader_user_id must match the authenticated user';
            END IF;
            IF (invasion->>'new_territory_id')::uuid != p_new_territory_id THEN
                RAISE EXCEPTION 'Invasion new_territory_id must match the territory being created';
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
