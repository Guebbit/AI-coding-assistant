/**
 * Minimal SQL migration runner for the Manna persistence layer.
 *
 * ## How it works
 *
 * 1. Ensures the `schema_migrations` tracking table exists.
 * 2. Reads every `.sql` file from the `migrations/` directory (sorted
 *    alphabetically so `001_initial.sql` always runs before `002_...sql`).
 * 3. Skips files that have already been applied (tracked by filename).
 * 4. Runs each pending file in a single transaction — if a file fails the
 *    transaction is rolled back and the runner stops.
 *
 * ## Usage
 *
 * ```typescript
 * import { runMigrations } from '../persistence/migrate';
 * await runMigrations();
 * ```
 *
 * Or from the command line (optional convenience):
 * ```bash
 * tsx packages/persistence/migrate.ts
 * ```
 *
 * @module persistence/migrate
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, closePool } from './db';
import { logger } from '../logger/logger';

/** Directory containing `*.sql` migration files. */
const MIGRATIONS_DIR = path.join(fileURLToPath(new URL('.', import.meta.url)), 'migrations');

/**
 * Apply all pending SQL migrations.
 *
 * Safe to call on every application startup — already-applied files are
 * skipped automatically.  Fail-open: errors are logged but will rethrow
 * so the caller can decide whether to abort startup or continue without
 * a database.
 *
 * @throws {Error} when a migration file fails to apply.
 */
export async function runMigrations(): Promise<void> {
    const pool = getPool();
    const client = await pool.connect();

    try {
        /* Ensure the tracking table exists. */
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename   TEXT        PRIMARY KEY,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        /* Read available migration files, sorted lexicographically. */
        let files: string[];
        try {
            const entries = await fs.readdir(MIGRATIONS_DIR);
            files = entries.filter((f: string) => f.endsWith('.sql')).sort();
        } catch {
            logger.warn('persistence_migrate_dir_not_found', {
                component: 'persistence.migrate',
                dir: MIGRATIONS_DIR
            });
            return;
        }

        for (const filename of files) {
            /* Check if already applied. */
            const { rows } = await client.query(
                'SELECT 1 FROM schema_migrations WHERE filename = $1',
                [filename]
            );
            if (rows.length > 0) {
                logger.info('persistence_migrate_skip', {
                    component: 'persistence.migrate',
                    filename
                });
                continue;
            }

            /* Read and execute the SQL file inside a transaction. */
            const filePath = path.join(MIGRATIONS_DIR, filename);
            const sql = await fs.readFile(filePath, 'utf-8');

            await client.query('BEGIN');
            try {
                await client.query(sql);
                await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
                    filename
                ]);
                await client.query('COMMIT');
                logger.info('persistence_migrate_applied', {
                    component: 'persistence.migrate',
                    filename
                });
            } catch (error: unknown) {
                await client.query('ROLLBACK');
                logger.warn('persistence_migrate_failed', {
                    component: 'persistence.migrate',
                    filename,
                    error: String(error)
                });
                throw error;
            }
        }

        logger.info('persistence_migrate_done', { component: 'persistence.migrate' });
    } finally {
        client.release();
    }
}

/* ── CLI entry point ─────────────────────────────────────────────────────── */

/* Allow running directly: `tsx packages/persistence/migrate.ts` */
const isMain =
    typeof process !== 'undefined' &&
    process.argv[1] != null &&
    (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js'));

if (isMain) {
    runMigrations()
        .then(() => {
            logger.info('persistence_migrate_cli_done', {
                component: 'persistence.migrate.cli',
                message: 'Migrations complete.'
            });
            return closePool();
        })
        .catch((error: unknown) => {
            logger.warn('persistence_migrate_cli_failed', {
                component: 'persistence.migrate.cli',
                error: String(error)
            });
            process.exit(1);
        });
}
