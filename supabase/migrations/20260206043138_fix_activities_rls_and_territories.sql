-- Fix 1: Allow all authenticated users to view activities (not just the owner)
-- This fixes the bug where viewing another user's profile shows "no activity"
DROP POLICY IF EXISTS "Users can see own activities" ON public.activities;

CREATE POLICY "Activities are viewable by everyone"
  ON public.activities FOR SELECT USING (true);

-- Fix 2: Add perimeter column to territories table (currently missing from schema)
-- This prevents territory cloud sync failures when saveTerritory sends the perimeter field
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'territories'
    AND column_name = 'perimeter'
  ) THEN
    ALTER TABLE public.territories ADD COLUMN perimeter float;
  END IF;
END $$;

-- Fix 3: Add missing columns to activities table that the app sends but may not exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'activities'
    AND column_name = 'end_time'
  ) THEN
    ALTER TABLE public.activities ADD COLUMN end_time timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'activities'
    AND column_name = 'is_synced'
  ) THEN
    ALTER TABLE public.activities ADD COLUMN is_synced boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'activities'
    AND column_name = 'territory_id'
  ) THEN
    ALTER TABLE public.activities ADD COLUMN territory_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'activities'
    AND column_name = 'average_speed'
  ) THEN
    ALTER TABLE public.activities ADD COLUMN average_speed float;
  END IF;
END $$;

-- Fix 4: Create a public RPC function for fetching user activities
-- This provides a reliable way to fetch another user's activities regardless of RLS
CREATE OR REPLACE FUNCTION public.get_user_activities(target_user_id uuid)
RETURNS SETOF public.activities
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.activities
  WHERE user_id = target_user_id
  ORDER BY start_time DESC;
$$;
