-- Migration: Territory Conquering Mechanism
-- Adds history column, territory_invasions table, and conquer_territory RPC

-- 1. Add history column to territories (TypeScript type has it, DB doesn't)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'territories'
    AND column_name = 'history'
  ) THEN
    ALTER TABLE public.territories ADD COLUMN history jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 2. Create territory_invasions table for notification system
CREATE TABLE IF NOT EXISTS public.territory_invasions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invaded_user_id uuid REFERENCES public.users(id) NOT NULL,
  invader_user_id uuid REFERENCES public.users(id) NOT NULL,
  invader_username text,
  invaded_territory_id uuid NOT NULL,
  new_territory_id uuid NOT NULL,
  overlap_area float NOT NULL,
  territory_was_destroyed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  seen boolean DEFAULT false
);

ALTER TABLE public.territory_invasions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own invasions"
  ON public.territory_invasions FOR SELECT
  USING (auth.uid() = invaded_user_id);

CREATE POLICY "Users can update own invasions"
  ON public.territory_invasions FOR UPDATE
  USING (auth.uid() = invaded_user_id);

-- 3. RPC function to atomically conquer territory
-- Runs as SECURITY DEFINER so it can modify any user's territory
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
