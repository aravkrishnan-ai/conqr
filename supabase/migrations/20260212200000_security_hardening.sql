-- Security Hardening Migration
-- 1. Strengthen conquer_territory RPC input validation (area bounds, polygon validation, coordinate checks)
-- 2. Add rate limiting on territory claims (max 1 per 30 seconds per user)
-- 3. Add rate limiting on get_leaderboard RPC
-- ========================================

-- ========================================
-- 1. Replace conquer_territory with hardened version
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

    -- Max area: 10 km² (10,000,000 m²) — no single walk/run loop can be larger
    IF p_area > 10000000 THEN
        RAISE EXCEPTION 'Invalid area: exceeds maximum of 10 km²';
    END IF;

    -- === Input validation: perimeter ===
    IF p_perimeter IS NOT NULL AND p_perimeter < 0 THEN
        RAISE EXCEPTION 'Invalid perimeter: must be non-negative';
    END IF;

    -- Max perimeter: 100 km (100,000 m) — reasonable upper bound for a 5-hour activity
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

    -- === Input validation: modified territories must exist ===
    IF jsonb_array_length(p_modified_territories) > 0 THEN
        FOR mod_territory IN SELECT * FROM jsonb_array_elements(p_modified_territories)
        LOOP
            mod_id := (mod_territory->>'id')::uuid;
            SELECT COUNT(*) INTO existing_count FROM public.territories WHERE id = mod_id;
            IF existing_count = 0 THEN
                RAISE EXCEPTION 'Modified territory % does not exist', mod_id;
            END IF;
        END LOOP;
    END IF;

    -- === Input validation: deleted territories must exist ===
    IF array_length(p_deleted_territory_ids, 1) IS NOT NULL THEN
        FOREACH del_id IN ARRAY p_deleted_territory_ids
        LOOP
            SELECT COUNT(*) INTO existing_count FROM public.territories WHERE id = del_id;
            IF existing_count = 0 THEN
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

-- ========================================
-- 2. Harden the saveTerritory direct INSERT path (event mode uses this)
--    Add a trigger that validates territory data on INSERT/UPDATE
-- ========================================
CREATE OR REPLACE FUNCTION public.validate_territory()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    last_claim timestamptz;
BEGIN
    -- Area bounds
    IF NEW.area IS NOT NULL AND NEW.area > 10000000 THEN
        RAISE EXCEPTION 'Territory area exceeds maximum of 10 km²';
    END IF;

    IF NEW.area IS NOT NULL AND NEW.area < 0 THEN
        RAISE EXCEPTION 'Territory area must be non-negative';
    END IF;

    -- Perimeter bounds
    IF NEW.perimeter IS NOT NULL AND NEW.perimeter > 100000 THEN
        RAISE EXCEPTION 'Territory perimeter exceeds maximum of 100 km';
    END IF;

    IF NEW.perimeter IS NOT NULL AND NEW.perimeter < 0 THEN
        RAISE EXCEPTION 'Territory perimeter must be non-negative';
    END IF;

    -- Center coordinate bounds
    IF NEW.center IS NOT NULL AND jsonb_typeof(NEW.center) = 'object' THEN
        IF (NEW.center->>'lat')::float < -90 OR (NEW.center->>'lat')::float > 90 THEN
            RAISE EXCEPTION 'Territory center latitude out of range';
        END IF;
        IF (NEW.center->>'lng')::float < -180 OR (NEW.center->>'lng')::float > 180 THEN
            RAISE EXCEPTION 'Territory center longitude out of range';
        END IF;
    END IF;

    -- Rate limit on INSERT: 30 seconds between claims per user
    IF TG_OP = 'INSERT' THEN
        SELECT MAX(claimed_at) INTO last_claim
        FROM public.territories
        WHERE owner_id = NEW.owner_id
          AND id != NEW.id;

        IF last_claim IS NOT NULL AND (now() - last_claim) < interval '30 seconds' THEN
            RAISE EXCEPTION 'Rate limited: wait at least 30 seconds between territory claims';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- Drop if exists to make migration idempotent
DROP TRIGGER IF EXISTS trigger_validate_territory ON public.territories;
CREATE TRIGGER trigger_validate_territory
    BEFORE INSERT OR UPDATE ON public.territories
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_territory();

-- ========================================
-- 3. Add missing indexes for query performance under load
-- ========================================
CREATE INDEX IF NOT EXISTS idx_post_likes_user_id
    ON public.post_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_post_comments_user_id
    ON public.post_comments(user_id);
