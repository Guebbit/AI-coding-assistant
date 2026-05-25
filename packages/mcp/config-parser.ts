/**
 * MCP config parser — schema validation + environment interpolation.
 *
 * ROLE: Reads and validates the MCP server configuration file
 * (data/mcp-servers.json). Handles env var interpolation in config values.
 *
 * @module mcp/config-parser
 */

import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { logger } from '../logger/logger';
import type { IMCPConfig, IMCPServerConfig } from './types';

/* ── Configuration ───────────────────────────────────────────────────── */

/** Default file path for MCP server configuration. */
const DEFAULT_MCP_CONFIG_PATH = 'data/mcp-servers.json';

/** Regex used to resolve `${VAR_NAME}` placeholders in MCP env entries. */
const ENV_INTERPOLATION_PATTERN = /\${(\w+)}/g;

/* ── Zod schemas ─────────────────────────────────────────────────────── */

/** Zod schema for stdio MCP servers. */
const stdioServerSchema = z.object({
    name: z.string().min(1),
    transport: z.literal('stdio'),
    command: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    timeoutMs: z.number().int().positive().optional(),
    writeTools: z.boolean().optional()
});

/** Zod schema for SSE MCP servers. */
const sseServerSchema = z.object({
    name: z.string().min(1),
    transport: z.literal('sse'),
    url: z.string().url(),
    timeoutMs: z.number().int().positive().optional(),
    writeTools: z.boolean().optional()
});

/** Zod schema for full MCP config file. */
const mcpConfigSchema = z.object({
    servers: z.array(z.union([stdioServerSchema, sseServerSchema]))
});

/* ── Environment interpolation ───────────────────────────────────────── */

/**
 * Interpolate `${VAR}` placeholders against `process.env`.
 * Missing environment variables resolve to an empty string.
 */
function interpolateEnvironmentValue(value: string): string {
    return value.replaceAll(ENV_INTERPOLATION_PATTERN, (_match, variableName: string) => {
        const resolvedValue = process.env[variableName];
        if (resolvedValue === undefined) {
            logger.warn('mcp_env_var_missing', { component: 'mcp', variableName });
            return '';
        }
        return resolvedValue;
    });
}

/**
 * Interpolate all env values in an env object.
 *
 * @param env - Optional environment map from config.
 * @returns Interpolated environment map or `undefined` when no env was provided.
 */
export function interpolateEnvironmentMap(
    env: Record<string, string> | undefined
): Record<string, string> | undefined {
    if (!env) return undefined;
    return Object.fromEntries(
        Object.entries(env).map(([key, value]) => [key, interpolateEnvironmentValue(value)])
    );
}

/* ── Config loading ──────────────────────────────────────────────────── */

/**
 * Resolve the absolute config path from env/defaults.
 */
export function resolveConfigPath(configPath?: string): string {
    const configuredPath = configPath ?? process.env.MCP_CONFIG_PATH ?? DEFAULT_MCP_CONFIG_PATH;
    return path.isAbsolute(configuredPath)
        ? configuredPath
        : path.resolve(process.cwd(), configuredPath);
}

/**
 * Check if the config file exists at the given path.
 */
export function configFileExists(absolutePath: string): Promise<boolean> {
    return access(absolutePath, fsConstants.F_OK)
        .then(() => true)
        .catch(() => false);
}

/**
 * Parse and validate MCP configuration from disk.
 *
 * @param absoluteConfigPath - Absolute config file path.
 * @returns Parsed MCP config or `null` when invalid.
 */
export async function parseMCPConfig(absoluteConfigPath: string): Promise<IMCPConfig | null> {
    const fileContents = await readFile(absoluteConfigPath, 'utf8');
    const parsedJson: unknown = JSON.parse(fileContents);
    const parsedConfig = mcpConfigSchema.safeParse(parsedJson);
    if (!parsedConfig.success) {
        logger.warn('mcp_config_invalid', {
            component: 'mcp',
            path: absoluteConfigPath,
            errors: parsedConfig.error.issues.map((issue) => issue.message)
        });
        return null;
    }
    return parsedConfig.data;
}
