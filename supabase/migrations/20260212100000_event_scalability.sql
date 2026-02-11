-- Indexes for territories table to support 100+ concurrent users during events
CREATE INDEX IF NOT EXISTS idx_territories_owner_id
  ON public.territories(owner_id);

CREATE INDEX IF NOT EXISTS idx_territories_claimed_at
  ON public.territories(claimed_at DESC);

CREATE INDEX IF NOT EXISTS idx_territories_owner_claimed
  ON public.territories(owner_id, claimed_at DESC);

-- Server-side leaderboard aggregation RPC
-- Returns top users ranked by total territory area, with optional time filtering.
-- Much more efficient than fetching all territories and aggregating client-side.
CREATE OR REPLACE FUNCTION public.get_leaderboard(
  p_since TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  user_id UUID,
  username TEXT,
  avatar_url TEXT,
  total_area DOUBLE PRECISION,
  territory_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.owner_id AS user_id,
    u.username,
    u.avatar_url,
    COALESCE(SUM(t.area), 0) AS total_area,
    COUNT(*)::BIGINT AS territory_count
  FROM public.territories t
  JOIN public.users u ON u.id = t.owner_id
  WHERE (p_since IS NULL OR t.claimed_at >= p_since)
    AND t.area > 0
  GROUP BY t.owner_id, u.username, u.avatar_url
  ORDER BY total_area DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(TIMESTAMPTZ, INT) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_leaderboard(TIMESTAMPTZ, INT) FROM anon;
