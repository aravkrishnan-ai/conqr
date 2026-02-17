-- Conqr Database Schema (current hardened state as of 2026-02-17)
-- ========================================

-- ========================================
-- Users
-- ========================================
CREATE TABLE public.users (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    username text UNIQUE,
    email text,
    bio text,
    avatar_url text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT users_bio_length CHECK (char_length(bio) <= 500),
    CONSTRAINT users_username_length CHECK (char_length(username) <= 50)
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone."
    ON public.users FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile."
    ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile."
    ON public.users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can delete own profile"
    ON public.users FOR DELETE USING (auth.uid() = id);

-- ========================================
-- Admin Users
-- ========================================
CREATE TABLE public.admin_users (
    user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read admin_users"
    ON public.admin_users FOR SELECT
    USING (auth.role() = 'authenticated');

-- ========================================
-- Territories
-- ========================================
CREATE TABLE public.territories (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text,
    owner_id uuid REFERENCES public.users(id),
    claimed_at timestamptz DEFAULT now(),
    area float,
    perimeter float,
    center jsonb,
    polygon jsonb,
    activity_id uuid,
    history jsonb,
    CONSTRAINT territories_name_length CHECK (char_length(name) <= 100)
);

ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Territories are viewable by everyone"
    ON public.territories FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create territories"
    ON public.territories FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update own territories"
    ON public.territories FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete own territories"
    ON public.territories FOR DELETE USING (auth.uid() = owner_id);

-- ========================================
-- Activities
-- ========================================
CREATE TABLE public.activities (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id),
    type text,
    start_time timestamptz,
    end_time timestamptz,
    distance float,
    duration float,
    polylines jsonb,
    is_synced boolean DEFAULT false,
    territory_id uuid,
    average_speed float
);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Activities are viewable by everyone"
    ON public.activities FOR SELECT USING (true);

CREATE POLICY "Users can insert own activities"
    ON public.activities FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own activities"
    ON public.activities FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own activities"
    ON public.activities FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- Territory Invasions
-- ========================================
CREATE TABLE public.territory_invasions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    invaded_user_id uuid REFERENCES public.users(id),
    invader_user_id uuid REFERENCES public.users(id),
    invader_username text,
    invaded_territory_id uuid,
    new_territory_id uuid,
    overlap_area float,
    territory_was_destroyed boolean DEFAULT false,
    seen boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.territory_invasions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own invasions"
    ON public.territory_invasions FOR SELECT
    USING (auth.uid() = invaded_user_id OR auth.uid() = invader_user_id);

CREATE POLICY "Users can update own invasion notifications"
    ON public.territory_invasions FOR UPDATE
    USING (auth.uid() = invaded_user_id);

-- ========================================
-- Friendships
-- ========================================
CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    addressee_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    status text DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    UNIQUE(requester_id, addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships"
    ON public.friendships FOR SELECT
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Authenticated users can send requests"
    ON public.friendships FOR INSERT
    WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Addressees can respond to requests"
    ON public.friendships FOR UPDATE
    USING (auth.uid() = addressee_id)
    WITH CHECK (
        auth.uid() = addressee_id
        AND requester_id = requester_id
        AND addressee_id = addressee_id
    );

CREATE POLICY "Users can delete own friendships"
    ON public.friendships FOR DELETE
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ========================================
-- Posts (Community Feed)
-- ========================================
CREATE TABLE public.posts (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    content text,
    post_type text DEFAULT 'text',
    activity_id uuid,
    territory_id uuid,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT posts_content_length CHECK (char_length(content) <= 5000)
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are viewable by everyone"
    ON public.posts FOR SELECT USING (true);

CREATE POLICY "Users can create own posts"
    ON public.posts FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
    ON public.posts FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
    ON public.posts FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- Post Likes
-- ========================================
CREATE TABLE public.post_likes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone"
    ON public.post_likes FOR SELECT USING (true);

CREATE POLICY "Users can create own likes"
    ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own likes"
    ON public.post_likes FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- Post Comments
-- ========================================
CREATE TABLE public.post_comments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    content text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT post_comments_content_length CHECK (char_length(content) <= 2000)
);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by everyone"
    ON public.post_comments FOR SELECT USING (true);

CREATE POLICY "Users can create own comments"
    ON public.post_comments FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own comments"
    ON public.post_comments FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own comments"
    ON public.post_comments FOR DELETE USING (auth.uid() = user_id);

-- ========================================
-- Analytics Events
-- ========================================
CREATE TABLE public.analytics_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
    event_name text NOT NULL,
    event_data jsonb,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own analytics"
    ON public.analytics_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own analytics"
    ON public.analytics_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own analytics"
    ON public.analytics_events FOR DELETE
    USING (auth.uid() = user_id);

-- ========================================
-- App Settings (admin-only write, public read)
-- ========================================
CREATE TABLE public.app_settings (
    key text PRIMARY KEY,
    value jsonb
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings"
    ON public.app_settings FOR SELECT USING (true);

CREATE POLICY "Only admins can insert settings"
    ON public.app_settings FOR INSERT
    WITH CHECK (
        auth.uid() IN (SELECT user_id FROM public.admin_users)
    );

CREATE POLICY "Only admins can update settings"
    ON public.app_settings FOR UPDATE
    USING (auth.uid() IN (SELECT user_id FROM public.admin_users))
    WITH CHECK (auth.uid() IN (SELECT user_id FROM public.admin_users));

CREATE POLICY "Only admins can delete settings"
    ON public.app_settings FOR DELETE
    USING (auth.uid() IN (SELECT user_id FROM public.admin_users));

-- ========================================
-- Functions
-- ========================================

-- Handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.users (id, email, username, avatar_url)
    VALUES (new.id, new.email, new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'avatar_url');
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Get user activities (strips polylines for non-owner callers)
CREATE OR REPLACE FUNCTION public.get_user_activities(target_user_id uuid)
RETURNS SETOF public.activities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() = target_user_id THEN
        RETURN QUERY
        SELECT * FROM public.activities
        WHERE user_id = target_user_id
        ORDER BY start_time DESC;
    ELSE
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

-- Get leaderboard (capped limit)
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

-- Toggle event mode (admin only)
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

-- Conquer territory (hardened with ownership validation)
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
    del_owner uuid;
    mod_owner uuid;
    inv_territory_owner uuid;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF p_owner_id != auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: can only conquer territories as yourself';
    END IF;

    -- Rate limiting: max 1 territory claim per 30 seconds
    SELECT MAX(claimed_at) INTO last_claim
    FROM public.territories
    WHERE owner_id = auth.uid();

    IF last_claim IS NOT NULL AND (now() - last_claim) < interval '30 seconds' THEN
        RAISE EXCEPTION 'Rate limited: wait at least 30 seconds between territory claims';
    END IF;

    -- Input validation
    IF p_area IS NULL OR p_area < 0 THEN
        RAISE EXCEPTION 'Invalid area: must be non-negative';
    END IF;
    IF p_area > 10000000 THEN
        RAISE EXCEPTION 'Invalid area: exceeds maximum of 10 km²';
    END IF;
    IF p_perimeter IS NOT NULL AND p_perimeter < 0 THEN
        RAISE EXCEPTION 'Invalid perimeter: must be non-negative';
    END IF;
    IF p_perimeter IS NOT NULL AND p_perimeter > 100000 THEN
        RAISE EXCEPTION 'Invalid perimeter: exceeds maximum of 100 km';
    END IF;
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
    IF p_center IS NULL OR jsonb_typeof(p_center) != 'object' THEN
        RAISE EXCEPTION 'Invalid center: must be a JSON object with lat/lng';
    END IF;
    center_lat := (p_center->>'lat')::float;
    center_lng := (p_center->>'lng')::float;
    IF center_lat IS NULL OR center_lat < -90 OR center_lat > 90 THEN
        RAISE EXCEPTION 'Invalid center latitude';
    END IF;
    IF center_lng IS NULL OR center_lng < -180 OR center_lng > 180 THEN
        RAISE EXCEPTION 'Invalid center longitude';
    END IF;

    -- Validate modified territories: must exist and NOT belong to caller
    IF jsonb_array_length(p_modified_territories) > 0 THEN
        FOR mod_territory IN SELECT * FROM jsonb_array_elements(p_modified_territories)
        LOOP
            mod_id := (mod_territory->>'id')::uuid;
            SELECT owner_id INTO mod_owner FROM public.territories WHERE id = mod_id;
            IF mod_owner IS NULL THEN
                RAISE EXCEPTION 'Modified territory % does not exist', mod_id;
            END IF;
            IF mod_owner = auth.uid() THEN
                RAISE EXCEPTION 'Cannot modify your own territory during conquering';
            END IF;
        END LOOP;
    END IF;

    -- Validate deleted territories: must exist and NOT belong to caller
    IF array_length(p_deleted_territory_ids, 1) IS NOT NULL THEN
        FOREACH del_id IN ARRAY p_deleted_territory_ids
        LOOP
            SELECT owner_id INTO del_owner FROM public.territories WHERE id = del_id;
            IF del_owner IS NULL THEN
                RAISE EXCEPTION 'Deleted territory % does not exist', del_id;
            END IF;
            IF del_owner = auth.uid() THEN
                RAISE EXCEPTION 'Cannot delete your own territory during conquering';
            END IF;
        END LOOP;
    END IF;

    -- Modified territory area can only shrink
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
                    RAISE EXCEPTION 'Territory area can only shrink during conquering';
                END IF;
            END;
        END LOOP;
    END IF;

    -- Validate invasions
    IF jsonb_array_length(p_invasions) > 0 THEN
        FOR invasion IN SELECT * FROM jsonb_array_elements(p_invasions)
        LOOP
            IF (invasion->>'invader_user_id')::uuid != auth.uid() THEN
                RAISE EXCEPTION 'Invasion invader_user_id must match authenticated user';
            END IF;
            IF (invasion->>'new_territory_id')::uuid != p_new_territory_id THEN
                RAISE EXCEPTION 'Invasion new_territory_id must match territory being created';
            END IF;
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

REVOKE ALL ON FUNCTION public.conquer_territory(uuid, uuid, text, uuid, text, timestamptz, float, float, jsonb, jsonb, jsonb, jsonb, uuid[], jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.conquer_territory(uuid, uuid, text, uuid, text, timestamptz, float, float, jsonb, jsonb, jsonb, jsonb, uuid[], jsonb) TO authenticated;

-- Join event (atomic with advisory lock, participant cap)
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    IF auth.uid() != p_user_id THEN
        RAISE EXCEPTION 'Unauthorized: can only join as yourself';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_event_id));

    SELECT value INTO v_event_value
    FROM public.app_settings
    WHERE key = 'current_event';

    IF v_event_value IS NULL OR v_event_value = 'null'::jsonb THEN
        RAISE EXCEPTION 'Event not found or has ended';
    END IF;
    IF v_event_value->>'id' != p_event_id THEN
        RAISE EXCEPTION 'Event not found or has ended';
    END IF;

    v_duration_minutes := (v_event_value->>'durationMinutes')::int;
    v_started_at := (v_event_value->>'startedAt')::timestamptz;
    IF v_duration_minutes IS NOT NULL AND v_started_at IS NOT NULL THEN
        v_end_time := v_started_at + (v_duration_minutes || ' minutes')::interval;
        IF now() > v_end_time THEN
            RAISE EXCEPTION 'Event has ended';
        END IF;
    END IF;

    v_prefix := 'event_join:' || p_event_id || ':';
    SELECT COUNT(*) INTO v_count
    FROM public.app_settings
    WHERE key LIKE v_prefix || '%';

    IF v_count >= v_max_participants THEN
        RAISE EXCEPTION 'Event is full (% participants max)', v_max_participants;
    END IF;

    v_key := v_prefix || p_user_id::text;
    INSERT INTO public.app_settings (key, value)
    VALUES (v_key, jsonb_build_object('joined_at', now()))
    ON CONFLICT (key) DO NOTHING;

    RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.join_event(text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_event(text, uuid) TO authenticated;
