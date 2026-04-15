-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001 — Initial schema
--
-- Tables:
--   agent_runs   — one row per Agent.run() execution
--   swarm_runs   — one row per LangGraphSwarmOrchestrator.run() execution
--   eval_results — one row per scorer evaluation of any run
-- ─────────────────────────────────────────────────────────────────────────────

-- ── agent_runs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_runs (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task           TEXT        NOT NULL,
    agent_profile  TEXT,
    input          JSONB,
    output         TEXT,
    context        TEXT,
    memory         JSONB,
    start_time     TIMESTAMPTZ NOT NULL,
    end_time       TIMESTAMPTZ,
    duration_ms    INTEGER,
    tool_calls     JSONB,
    diagnostic_log TEXT,
    status         TEXT        NOT NULL DEFAULT 'completed',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_created_at ON agent_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status     ON agent_runs (status);

-- ── swarm_runs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS swarm_runs (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task             TEXT        NOT NULL,
    decomposition    JSONB,
    subtasks         JSONB,
    results          JSONB,
    answer           TEXT,
    start_time       TIMESTAMPTZ NOT NULL,
    end_time         TIMESTAMPTZ,
    total_duration_ms INTEGER,
    status           TEXT        NOT NULL DEFAULT 'completed',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swarm_runs_created_at ON swarm_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swarm_runs_status     ON swarm_runs (status);

-- ── eval_results ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS eval_results (
    id         UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id     UUID,
    run_type   TEXT,
    scorer     TEXT             NOT NULL,
    score      DOUBLE PRECISION NOT NULL,
    reasoning  TEXT,
    metadata   JSONB,
    created_at TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eval_results_run_id     ON eval_results (run_id);
CREATE INDEX IF NOT EXISTS idx_eval_results_scorer     ON eval_results (scorer);
CREATE INDEX IF NOT EXISTS idx_eval_results_created_at ON eval_results (created_at DESC);
