-- Preserve runs and player snapshots. Only disposable request receipts are bounded.
ALTER TABLE public.idol_arena_runs ADD COLUMN last_opponent text;
UPDATE public.idol_arena_runs SET last_opponent=last_battle->'opponent'->>'owner';
CREATE INDEX idol_arena_requests_expiry ON public.idol_arena_requests(created_at);

CREATE FUNCTION public.idol_arena_commit_v2(p_owner text,p_revision bigint,p_request text,p_fingerprint text,p_run jsonb,p_result jsonb,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE current_run jsonb; saved_battle jsonb; receipt jsonb; prior public.idol_arena_requests%ROWTYPE;
BEGIN
 SELECT run INTO current_run FROM public.idol_arena_runs WHERE owner_hash=p_owner FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status',401,'error','对局不存在，请重新组队'); END IF;
 SELECT * INTO prior FROM public.idol_arena_requests WHERE owner_hash=p_owner AND request_id=p_request;
 IF FOUND THEN
  IF prior.fingerprint<>p_fingerprint THEN RETURN jsonb_build_object('status',409,'error','同一操作标识不能用于不同请求'); END IF;
  IF prior.result ? 'replayRevision' THEN
   SELECT last_battle INTO saved_battle FROM public.idol_arena_runs WHERE owner_hash=p_owner;
   IF saved_battle->'replayRevision' IS DISTINCT FROM prior.result->'replayRevision' THEN
    RETURN jsonb_build_object('status',409,'error','旧回合回放已更新，请同步当前对局');
   END IF;
   RETURN jsonb_build_object('run',prior.result->'run','battle',saved_battle->'battle','opponent',saved_battle->'opponent');
  END IF;
  RETURN prior.result;
 END IF;
 IF (current_run->>'revision')::bigint<>p_revision THEN RETURN jsonb_build_object('status',409,'error','对局已经更新，请同步后重试'); END IF;
 IF (p_run->>'revision')::bigint<>p_revision+1 THEN RAISE EXCEPTION 'invalid revision'; END IF;
 receipt=p_result;
 IF p_snapshot IS NOT NULL THEN
  INSERT INTO public.idol_arena_snapshots(id,ruleset,round,owner_hash,source,name,team,wins)
  VALUES(p_snapshot->>'id',p_snapshot->>'ruleset',(p_snapshot->>'round')::integer,p_owner,'player',p_snapshot->>'name',p_snapshot->'team',(p_snapshot->>'wins')::integer)
  ON CONFLICT(id) DO NOTHING;
  -- Keep the large replay once; receipts reference it instead of duplicating it.
  saved_battle=(p_result-'run') || jsonb_build_object('replayRevision',p_run->'revision');
  receipt=jsonb_build_object('run',p_result->'run','replayRevision',p_run->'revision');
 END IF;
 UPDATE public.idol_arena_runs SET run=p_run-'preparationEvents',
  last_battle=CASE WHEN p_snapshot IS NOT NULL THEN saved_battle ELSE last_battle END,
  last_opponent=CASE WHEN p_snapshot IS NOT NULL THEN p_result->'opponent'->>'owner' ELSE last_opponent END,
  updated_at=now() WHERE owner_hash=p_owner;
 INSERT INTO public.idol_arena_requests(owner_hash,request_id,fingerprint,result) VALUES(p_owner,p_request,p_fingerprint,receipt);
 -- Retain at most 30 receipts per run. Expiry work is bounded, inside settlement.
 DELETE FROM public.idol_arena_requests WHERE owner_hash=p_owner AND request_id IN (
  SELECT request_id FROM public.idol_arena_requests WHERE owner_hash=p_owner ORDER BY created_at DESC,request_id DESC OFFSET 30
 );
 DELETE FROM public.idol_arena_requests WHERE (owner_hash,request_id) IN (
  SELECT owner_hash,request_id FROM public.idol_arena_requests WHERE created_at<now()-interval '7 days' ORDER BY created_at LIMIT 256 FOR UPDATE SKIP LOCKED
 );
 RETURN p_result;
END $$;
REVOKE ALL ON FUNCTION public.idol_arena_commit_v2(text,bigint,text,text,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.idol_arena_commit_v2(text,bigint,text,text,jsonb,jsonb,jsonb) TO service_role;

-- Initial pruning does not touch progress, the latest replay, or any player team.
DELETE FROM public.idol_arena_requests WHERE (owner_hash,request_id) IN (
 SELECT owner_hash,request_id FROM (
  SELECT owner_hash,request_id,created_at,row_number() OVER (PARTITION BY owner_hash ORDER BY created_at DESC,request_id DESC) AS rank
  FROM public.idol_arena_requests
 ) receipts WHERE rank>30 OR created_at<now()-interval '7 days'
);
