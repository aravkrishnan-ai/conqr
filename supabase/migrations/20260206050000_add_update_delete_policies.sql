-- Add UPDATE policy for activities so upsert works in syncPendingActivities
-- Without this, upsert fails when the activity already exists in the cloud
CREATE POLICY "Users can update own activities"
  ON public.activities FOR UPDATE USING (auth.uid() = user_id);

-- Add DELETE policy for activities so deleteActivity works
CREATE POLICY "Users can delete own activities"
  ON public.activities FOR DELETE USING (auth.uid() = user_id);

-- Add UPDATE policy for territories so territory updates work
CREATE POLICY "Users can update own territories"
  ON public.territories FOR UPDATE USING (auth.uid() = owner_id);

-- Add DELETE policy for territories so deleteTerritory works
CREATE POLICY "Users can delete own territories"
  ON public.territories FOR DELETE USING (auth.uid() = owner_id);
