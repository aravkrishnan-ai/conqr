-- Security Fixes Migration
-- Addresses Supabase Security Advisor findings:
-- 1. Tables with overly permissive RLS (using true) allowing unauthenticated access
-- 2. SECURITY DEFINER functions missing caller authorization checks
-- 3. Missing RLS policies leaving incomplete coverage
-- ========================================

-- ========================================
-- 1. Restrict SELECT policies to authenticated users only
--    Previously: using(true) allowed unauthenticated/anon reads
--    Fix: Require auth.role() = 'authenticated'
-- ========================================

-- Activities: Replace public read with authenticated-only read
DROP POLICY IF EXISTS "Activities are viewable by everyone" ON public.activities;
CREATE POLICY "Activities are viewable by authenticated users"
    ON public.activities FOR SELECT
    USING (auth.role() = 'authenticated');

-- Territories: Replace public read with authenticated-only read
DROP POLICY IF EXISTS "Territories are viewable by everyone" ON public.territories;
CREATE POLICY "Territories are viewable by authenticated users"
    ON public.territories FOR SELECT
    USING (auth.role() = 'authenticated');

-- Users/Profiles: Replace public read with authenticated-only read
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.users;
CREATE POLICY "Profiles are viewable by authenticated users"
    ON public.users FOR SELECT
    USING (auth.role() = 'authenticated');

-- ========================================
-- 2. Fix SECURITY DEFINER functions with authorization checks
-- ========================================

-- Fix get_user_activities: Add auth check so only authenticated users can call it
-- This function bypasses RLS, so it must validate the caller is logged in
CREATE OR REPLACE FUNCTION public.get_user_activities(target_user_id uuid)
RETURNS SETOF public.activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Ensure caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    RETURN QUERY
    SELECT * FROM public.activities
    WHERE user_id = target_user_id
    ORDER BY start_time DESC;
END;
$$;

-- Fix conquer_territory: Add auth check and input validation
-- This function modifies any user's territories, so it must verify the caller owns the action
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
BEGIN
    -- Authorization: caller must be the territory owner
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: can only conquer territories as yourself';
    END IF;

    -- Input validation
    IF p_area IS NOT NULL AND p_area < 0 THEN
        RAISE EXCEPTION 'Invalid area: must be non-negative';
    END IF;

    IF p_perimeter IS NOT NULL AND p_perimeter < 0 THEN
        RAISE EXCEPTION 'Invalid perimeter: must be non-negative';
    END IF;

    -- Insert the new territory
    INSERT INTO public.territories (id, owner_id, name, activity_id, claimed_at, area, perimeter, center, polygon, history)
    VALUES (p_new_territory_id, p_owner_id, p_name, p_activity_id, p_claimed_at, p_area, p_perimeter, p_center, p_polygon, p_history);

    -- Update modified (shrunk) territories
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

    -- Delete fully consumed territories
    FOREACH del_id IN ARRAY p_deleted_territory_ids
    LOOP
        DELETE FROM public.territories WHERE id = del_id;
    END LOOP;

    -- Insert invasion notifications
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
-- 3. Add missing RLS policies for complete coverage
-- ========================================

-- post_comments: Add UPDATE policy (users can edit own comments)
CREATE POLICY "Users can update own comments" ON public.post_comments
    FOR UPDATE USING (auth.uid() = user_id);

-- territory_invasions: Add INSERT policy for the SECURITY DEFINER function fallback
-- The conquer_territory function inserts as SECURITY DEFINER, but if direct insert
-- is ever attempted, restrict to service role only
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'territory_invasions'
        AND policyname = 'System can insert invasions'
    ) THEN
        CREATE POLICY "System can insert invasions" ON public.territory_invasions
            FOR INSERT WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- territory_invasions: Add DELETE policy so users can dismiss/clear old notifications
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'territory_invasions'
        AND policyname = 'Users can delete own invasions'
    ) THEN
        CREATE POLICY "Users can delete own invasions" ON public.territory_invasions
            FOR DELETE USING (auth.uid() = invaded_user_id);
    END IF;
END $$;

-- ========================================
-- 4. Revoke public execute on SECURITY DEFINER functions
--    Restrict to authenticated users only
-- ========================================
REVOKE EXECUTE ON FUNCTION public.conquer_territory(uuid, uuid, text, uuid, text, timestamptz, float, float, jsonb, jsonb, jsonb, jsonb, uuid[], jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_activities(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
