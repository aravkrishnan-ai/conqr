-- Reports and Blocks tables for Play Store UGC policy compliance

-- User Reports table
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    report_type TEXT NOT NULL CHECK (report_type IN ('post', 'comment', 'user')),
    target_id UUID,
    reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'other')),
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User Blocks table
CREATE TABLE IF NOT EXISTS user_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(blocker_id, blocked_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON user_reports(reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON user_blocks(blocked_id);

-- Enable RLS
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_reports
-- Users can insert their own reports
CREATE POLICY "users_insert_own_reports" ON user_reports
    FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Users can read their own reports
CREATE POLICY "users_read_own_reports" ON user_reports
    FOR SELECT USING (auth.uid() = reporter_id);

-- RLS Policies for user_blocks
-- Users can insert their own blocks
CREATE POLICY "users_insert_own_blocks" ON user_blocks
    FOR INSERT WITH CHECK (auth.uid() = blocker_id);

-- Users can read their own blocks (blocked user cannot see they are blocked)
CREATE POLICY "users_read_own_blocks" ON user_blocks
    FOR SELECT USING (auth.uid() = blocker_id);

-- Users can delete their own blocks (unblock)
CREATE POLICY "users_delete_own_blocks" ON user_blocks
    FOR DELETE USING (auth.uid() = blocker_id);

-- Allow users to delete their own reports/blocks on account deletion
CREATE POLICY "users_delete_own_reports" ON user_reports
    FOR DELETE USING (auth.uid() = reporter_id OR auth.uid() = reported_user_id);

CREATE POLICY "users_delete_own_blocks_as_blocked" ON user_blocks
    FOR DELETE USING (auth.uid() = blocked_id);
