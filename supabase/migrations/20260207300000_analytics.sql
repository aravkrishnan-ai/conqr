-- Analytics Events
-- ========================================

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES public.users(id) NOT NULL,
    event_type text NOT NULL,
    screen_name text,
    session_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON public.analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user_session ON public.analytics_events(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_analytics_screen_name ON public.analytics_events(screen_name) WHERE screen_name IS NOT NULL;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Users can insert their own events
CREATE POLICY "Users can insert own analytics" ON public.analytics_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Only service role (your Supabase dashboard) can read all events
-- Individual users cannot read analytics data
CREATE POLICY "Service role can read all analytics" ON public.analytics_events
    FOR SELECT USING (auth.role() = 'service_role');

-- ========================================
-- Dashboard Views (query these in Supabase SQL editor)
-- ========================================

-- Daily Active Users
CREATE OR REPLACE VIEW public.analytics_daily_active_users AS
SELECT
    date_trunc('day', created_at)::date AS day,
    COUNT(DISTINCT user_id) AS dau,
    COUNT(*) AS total_events
FROM public.analytics_events
WHERE event_type = 'session_start'
GROUP BY day
ORDER BY day DESC;

-- Weekly Active Users (rolling 7-day windows)
CREATE OR REPLACE VIEW public.analytics_weekly_active_users AS
SELECT
    date_trunc('week', created_at)::date AS week_start,
    COUNT(DISTINCT user_id) AS wau
FROM public.analytics_events
WHERE event_type = 'session_start'
GROUP BY week_start
ORDER BY week_start DESC;

-- Screen Popularity
CREATE OR REPLACE VIEW public.analytics_screen_popularity AS
SELECT
    screen_name,
    COUNT(*) AS view_count,
    COUNT(DISTINCT user_id) AS unique_users,
    COUNT(DISTINCT session_id) AS unique_sessions
FROM public.analytics_events
WHERE event_type = 'screen_view' AND screen_name IS NOT NULL
GROUP BY screen_name
ORDER BY view_count DESC;

-- Feature Adoption (daily breakdown)
CREATE OR REPLACE VIEW public.analytics_feature_adoption AS
SELECT
    date_trunc('day', created_at)::date AS day,
    COUNT(*) FILTER (WHERE event_type = 'activity_saved') AS activities_saved,
    COUNT(*) FILTER (WHERE event_type = 'territory_claimed') AS territories_claimed,
    COUNT(*) FILTER (WHERE event_type = 'territory_invaded') AS territories_invaded,
    COUNT(*) FILTER (WHERE event_type = 'post_created') AS posts_created,
    COUNT(*) FILTER (WHERE event_type = 'post_liked') AS posts_liked,
    COUNT(*) FILTER (WHERE event_type = 'comment_added') AS comments_added,
    COUNT(*) FILTER (WHERE event_type = 'friend_request_sent') AS friend_requests_sent,
    COUNT(*) FILTER (WHERE event_type = 'share_initiated') AS shares_initiated
FROM public.analytics_events
GROUP BY day
ORDER BY day DESC;

-- Session Stats
CREATE OR REPLACE VIEW public.analytics_session_stats AS
SELECT
    s.session_id,
    s.user_id,
    s.started_at,
    e.ended_at,
    EXTRACT(EPOCH FROM (COALESCE(e.ended_at, s.started_at) - s.started_at))::int AS duration_seconds,
    s.event_count
FROM (
    SELECT
        session_id,
        user_id,
        MIN(created_at) AS started_at,
        COUNT(*) AS event_count
    FROM public.analytics_events
    WHERE session_id IS NOT NULL
    GROUP BY session_id, user_id
) s
LEFT JOIN (
    SELECT session_id, MAX(created_at) AS ended_at
    FROM public.analytics_events
    WHERE event_type = 'session_end'
    GROUP BY session_id
) e ON s.session_id = e.session_id
ORDER BY s.started_at DESC;

-- Error Log
CREATE OR REPLACE VIEW public.analytics_error_log AS
SELECT
    id,
    user_id,
    event_type,
    screen_name,
    metadata->>'message' AS error_message,
    metadata->>'stack' AS error_stack,
    metadata->>'component' AS component,
    created_at
FROM public.analytics_events
WHERE event_type IN ('error', 'crash')
ORDER BY created_at DESC;

-- User Engagement Summary
CREATE OR REPLACE VIEW public.analytics_user_engagement AS
SELECT
    user_id,
    COUNT(DISTINCT session_id) AS total_sessions,
    COUNT(*) FILTER (WHERE event_type = 'screen_view') AS total_screen_views,
    COUNT(*) FILTER (WHERE event_type = 'activity_saved') AS total_activities,
    COUNT(*) FILTER (WHERE event_type = 'territory_claimed') AS total_territories,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen,
    COUNT(DISTINCT date_trunc('day', created_at)::date) AS active_days
FROM public.analytics_events
GROUP BY user_id
ORDER BY last_seen DESC;
