-- Persistent private runs and an atomic, idempotent settlement transaction.
CREATE TABLE public.idol_arena_runs (
 owner_hash text PRIMARY KEY CHECK (owner_hash ~ '^[a-f0-9]{64}$'),
 run jsonb NOT NULL,
 last_battle jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.idol_arena_requests (
 owner_hash text NOT NULL REFERENCES public.idol_arena_runs(owner_hash) ON DELETE CASCADE,
 request_id text NOT NULL,
 fingerprint text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (owner_hash,request_id)
);
ALTER TABLE public.idol_arena_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idol_arena_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idol_arena_runs, public.idol_arena_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idol_arena_runs, public.idol_arena_requests TO service_role;
CREATE FUNCTION public.idol_arena_commit(p_owner text,p_revision bigint,p_request text,p_fingerprint text,p_run jsonb,p_result jsonb,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE current_run jsonb; prior public.idol_arena_requests%ROWTYPE;
BEGIN
 SELECT run INTO current_run FROM public.idol_arena_runs WHERE owner_hash=p_owner FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','对局不存在，请重新组队'); END IF;
 SELECT * INTO prior FROM public.idol_arena_requests WHERE owner_hash=p_owner AND request_id=p_request;
 IF FOUND THEN
  IF prior.fingerprint<>p_fingerprint THEN RETURN jsonb_build_object('status',409,'error','同一操作标识不能用于不同请求'); END IF;
  RETURN prior.result;
 END IF;
 IF (current_run->>'revision')::bigint<>p_revision THEN RETURN jsonb_build_object('status',409,'error','对局已经更新，请同步后重试'); END IF;
 IF (p_run->>'revision')::bigint<>p_revision+1 THEN RAISE EXCEPTION 'invalid revision'; END IF;
 IF p_snapshot IS NOT NULL THEN
  INSERT INTO public.idol_arena_snapshots(id,ruleset,round,owner_hash,source,name,team,wins)
  VALUES(p_snapshot->>'id',p_snapshot->>'ruleset',(p_snapshot->>'round')::integer,p_owner,'player',p_snapshot->>'name',p_snapshot->'team',(p_snapshot->>'wins')::integer)
  ON CONFLICT(id) DO NOTHING;
 END IF;
 UPDATE public.idol_arena_runs SET run=p_run,last_battle=CASE WHEN p_snapshot IS NOT NULL THEN p_result-'run' ELSE last_battle END,updated_at=now() WHERE owner_hash=p_owner;
 INSERT INTO public.idol_arena_requests(owner_hash,request_id,fingerprint,result) VALUES(p_owner,p_request,p_fingerprint,p_result);
 RETURN p_result;
END $$;
REVOKE ALL ON FUNCTION public.idol_arena_commit(text,bigint,text,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.idol_arena_commit(text,bigint,text,text,jsonb,jsonb,jsonb) TO service_role;
