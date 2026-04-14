/**
 * Neo4j client wrapper for the Manna knowledge graph.
 *
 * Provides a lightweight, fail-open interface around `neo4j-driver`.
 * All public functions catch connection and query errors, log a warning
 * via the Manna logger, and return safe defaults rather than throwing —
 * ensuring that Neo4j unavailability never crashes the agent or blocks
 * document ingestion.
 *
 * **Configuration** (all optional):
 * - `NEO4J_URI`      (default `bolt://localhost:7687`)
 * - `NEO4J_USER`     (default `neo4j`)
 * - `NEO4J_PASSWORD` (default `manna`)
 * - `NEO4J_DATABASE` (default `neo4j`)
 *
 * @module graph/client
 */

import neo4j, { type Driver, type Session } from 'neo4j-driver';
import type { GraphQueryRow } from './types';
import { getLogger } from '../logger/logger';

const log = getLogger('graph:client');

/* ── Configuration ──────────────────────────────────────────────────── */

const NEO4J_URI = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? 'manna';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE ?? 'neo4j';

/* ── Singleton driver ───────────────────────────────────────────────── */

/** Lazily-initialised Neo4j driver (one per process). */
let _driver: Driver | undefined;

/**
 * Return the shared Neo4j driver, creating it on first call.
 *
 * The driver itself does not open a connection until a session is
 * requested; creation is therefore cheap even if Neo4j is unreachable.
 *
 * @returns The singleton `Driver` instance.
 */
export function getDriver(): Driver {
    if (!_driver) {
        _driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    }
    return _driver;
}

/**
 * Close the driver and release all open connections.
 *
 * Call this during graceful shutdown; safe to call multiple times.
 *
 * @returns A promise that resolves once the driver is fully closed.
 */
export async function closeDriver(): Promise<void> {
    if (_driver) {
        await _driver.close();
        _driver = undefined;
    }
}

/* ── Cypher execution ───────────────────────────────────────────────── */

/**
 * Execute a Cypher query and return all rows as plain JS objects.
 *
 * This is the primary write/read primitive for the knowledge graph.
 * On failure it logs a warning and returns an empty array (fail-open).
 *
 * @param cypher     - The Cypher query string.
 * @param parameters - Optional named parameters to bind (`$param` syntax).
 * @returns An array of result rows; empty on failure or no matches.
 */
export async function runCypher(
    cypher: string,
    parameters: Record<string, unknown> = {}
): Promise<GraphQueryRow[]> {
    let session: Session | undefined;
    try {
        const driver = getDriver();
        session = driver.session({ database: NEO4J_DATABASE });
        const result = await session.run(cypher, parameters);
        return result.records.map((record) => record.toObject() as GraphQueryRow);
    } catch (error) {
        log.warn('neo4j_query_failed', {
            error: String(error),
            cypher: cypher.slice(0, 200)
        });
        return [];
    } finally {
        await session?.close();
    }
}

/**
 * Verify that the Neo4j server is reachable by running a trivial ping.
 *
 * @returns `true` if the server is reachable, `false` otherwise.
 */
export async function isGraphAvailable(): Promise<boolean> {
    let session: Session | undefined;
    try {
        const driver = getDriver();
        session = driver.session({ database: NEO4J_DATABASE });
        await session.run('RETURN 1');
        return true;
    } catch {
        return false;
    } finally {
        await session?.close();
    }
}

/* ── Constraint initialisation ──────────────────────────────────────── */

/**
 * Ensure the uniqueness constraints required by the schema exist.
 *
 * Idempotent — safe to call on every application start.
 * Fails open if Neo4j is unreachable.
 *
 * **Constraints created:**
 * - `Entity(name, type)` — no two entities may share the same name AND type.
 */
export async function ensureConstraints(): Promise<void> {
    try {
        await runCypher(
            'CREATE CONSTRAINT entity_unique IF NOT EXISTS ' +
                'FOR (e:Entity) REQUIRE (e.name, e.type) IS UNIQUE'
        );
    } catch (error) {
        /* Some Neo4j editions / older versions may not support IF NOT EXISTS. */
        log.warn('neo4j_constraint_setup_failed', { error: String(error) });
    }
}
