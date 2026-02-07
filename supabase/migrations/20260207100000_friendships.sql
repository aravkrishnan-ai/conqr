-- Migration: Friendships system
-- Adds friendships table for friend request/accept/reject workflow

CREATE TABLE IF NOT EXISTS public.friendships (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id uuid REFERENCES public.users(id) NOT NULL,
    addressee_id uuid REFERENCES public.users(id) NOT NULL,
    status text CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(requester_id, addressee_id)
);

-- Prevent self-friendships
ALTER TABLE public.friendships
    ADD CONSTRAINT no_self_friendship CHECK (requester_id != addressee_id);

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Users can see friendships where they are requester or addressee
CREATE POLICY "Users can view own friendships"
    ON public.friendships FOR SELECT
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Users can insert where they are the requester
CREATE POLICY "Users can send friend requests"
    ON public.friendships FOR INSERT
    WITH CHECK (auth.uid() = requester_id);

-- Addressees can respond to requests (accept/reject)
CREATE POLICY "Addressees can respond to requests"
    ON public.friendships FOR UPDATE
    USING (auth.uid() = addressee_id);

-- Users can delete (unfriend) where they are requester or addressee
CREATE POLICY "Users can remove friendships"
    ON public.friendships FOR DELETE
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON public.friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON public.friendships(status);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_friendships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER friendships_updated_at_trigger
    BEFORE UPDATE ON public.friendships
    FOR EACH ROW
    EXECUTE FUNCTION update_friendships_updated_at();
