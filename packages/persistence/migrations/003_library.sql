-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003 — Library persistence
--
-- Tables:
--   libraries         — one row per registered library
--   library_articles  — one row per indexed article within a library
-- ─────────────────────────────────────────────────────────────────────────────

-- ── libraries ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS libraries (
    id             TEXT        PRIMARY KEY,
    name           TEXT        NOT NULL,
    config         JSONB       NOT NULL DEFAULT '{}',
    article_count  INTEGER     NOT NULL DEFAULT 0,
    last_import_at TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── library_articles ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS library_articles (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    library_id       TEXT        NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
    title            TEXT        NOT NULL,
    summary          TEXT        NOT NULL,
    topics           JSONB       NOT NULL DEFAULT '[]',
    year             INTEGER,
    month            TEXT,
    start_page       INTEGER     NOT NULL,
    end_page         INTEGER,
    pdf_path         TEXT        NOT NULL,
    pdf_page_offset  INTEGER     DEFAULT 0,
    qdrant_point_id  TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_library_articles_library_id ON library_articles (library_id);
CREATE INDEX IF NOT EXISTS idx_library_articles_year_month ON library_articles (library_id, year, month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_library_articles_dedup
    ON library_articles (library_id, title, year, month, start_page);
