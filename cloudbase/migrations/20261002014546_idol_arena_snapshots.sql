-- Private queue-arena snapshot pool. Browser clients access only the game service.
CREATE TABLE public.idol_arena_snapshots (
  id text PRIMARY KEY,
  ruleset text NOT NULL,
  round integer NOT NULL CHECK (round > 0),
  owner_hash text NOT NULL,
  source text NOT NULL CHECK (source IN ('player', 'training')),
  name text NOT NULL,
  team jsonb NOT NULL CHECK (jsonb_typeof(team) = 'array' AND jsonb_array_length(team) = 5),
  wins integer NOT NULL DEFAULT 0 CHECK (wins BETWEEN 0 AND 10),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idol_arena_snapshots_match ON public.idol_arena_snapshots (ruleset, round, source, created_at DESC);
ALTER TABLE public.idol_arena_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idol_arena_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idol_arena_snapshots TO service_role;
-- Rollback is intentionally not automatic: dropping this table would lose player history.
