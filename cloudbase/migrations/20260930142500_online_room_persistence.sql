CREATE TABLE public.online_room_owner (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  owner text,
  epoch bigint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO public.online_room_owner(id) VALUES (true);
CREATE TABLE public.online_room_state (
  code text PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{3,12}$'),
  snapshot text NOT NULL CHECK (octet_length(snapshot) <= 8388608),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.online_room_owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.online_room_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.online_room_owner, public.online_room_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.online_room_owner, public.online_room_state TO service_role;

CREATE FUNCTION public.online_room_store(p_operation text, p_owner text, p_epoch bigint, p_code text, p_snapshot text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v public.online_room_owner%ROWTYPE; result jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO STRICT v FROM public.online_room_owner WHERE id = true FOR UPDATE;
  IF p_owner IS NULL OR length(p_owner) < 16 THEN RAISE EXCEPTION 'Invalid owner'; END IF;
  IF p_operation = 'acquire' THEN
    IF v.owner IS NOT NULL AND v.expires_at > clock_timestamp() THEN RAISE EXCEPTION 'Room service already owned'; END IF;
    UPDATE public.online_room_owner SET owner = p_owner, epoch = v.epoch + 1, expires_at = clock_timestamp() + interval '60 seconds' WHERE id = true;
    SELECT jsonb_build_object('epoch', v.epoch + 1, 'rooms', COALESCE(jsonb_agg(code ORDER BY code), '[]'::jsonb)) INTO result FROM public.online_room_state;
    RETURN result;
  END IF;
  IF p_operation = 'release' THEN
    UPDATE public.online_room_owner SET owner = NULL, expires_at = '-infinity' WHERE id = true AND owner = p_owner AND epoch = p_epoch;
    RETURN result;
  END IF;
  IF v.owner IS DISTINCT FROM p_owner OR v.epoch <> p_epoch OR v.expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Room service ownership lost'; END IF;
  IF p_operation IN ('save', 'load', 'remove') AND (p_code IS NULL OR p_code !~ '^[A-Z0-9]{3,12}$') THEN RAISE EXCEPTION 'Invalid room code'; END IF;
  IF p_operation = 'save' THEN
    INSERT INTO public.online_room_state(code, snapshot) VALUES (p_code, p_snapshot)
      ON CONFLICT (code) DO UPDATE SET snapshot = EXCLUDED.snapshot, updated_at = clock_timestamp();
  ELSIF p_operation = 'load' THEN
    SELECT jsonb_build_object('snapshot', snapshot) INTO result FROM public.online_room_state WHERE code = p_code;
    IF result IS NULL THEN RAISE EXCEPTION 'Missing room snapshot'; END IF;
  ELSIF p_operation = 'remove' THEN
    DELETE FROM public.online_room_state WHERE code = p_code;
  ELSIF p_operation <> 'renew' THEN RAISE EXCEPTION 'Invalid storage operation';
  END IF;
  UPDATE public.online_room_owner SET expires_at = clock_timestamp() + interval '60 seconds' WHERE id = true;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.online_room_store(text, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.online_room_store(text, text, bigint, text, text) TO service_role;
