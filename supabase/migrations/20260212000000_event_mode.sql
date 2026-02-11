-- App settings table for global flags (e.g., event mode)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT 'false'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES public.users(id)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read settings
CREATE POLICY "Settings readable by authenticated users"
  ON public.app_settings FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only dev can update settings
CREATE POLICY "Only dev can update settings"
  ON public.app_settings FOR UPDATE
  USING (
    auth.uid() = (SELECT id FROM public.users WHERE email = 'arav_krishnan@ug29.mesaschool.co' LIMIT 1)
  );

-- Insert default event_mode = false
INSERT INTO public.app_settings (key, value)
VALUES ('event_mode', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- RPC to toggle event mode (dev-only)
CREATE OR REPLACE FUNCTION public.toggle_event_mode(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dev_id uuid;
BEGIN
  -- Verify caller is the dev
  SELECT id INTO dev_id FROM public.users
  WHERE email = 'arav_krishnan@ug29.mesaschool.co' LIMIT 1;

  IF dev_id IS NULL OR auth.uid() != dev_id THEN
    RAISE EXCEPTION 'Unauthorized: only the dev can toggle event mode';
  END IF;

  -- Update the setting
  UPDATE public.app_settings
  SET value = to_jsonb(p_enabled), updated_at = now(), updated_by = auth.uid()
  WHERE key = 'event_mode';

  RETURN jsonb_build_object('success', true, 'event_mode', p_enabled);
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_event_mode(boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_event_mode(boolean) FROM anon;
