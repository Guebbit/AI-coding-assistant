import { createHash } from 'node:crypto';

export interface IToolCallDeduplicatorOptions {
    cooldownMsByToolName?: Record<string, number>;
}

export class ToolCallDeduplicator {
    private readonly seenByToolName = new Map<string, Map<string, number>>();
    private readonly cooldownMsByToolName: Record<string, number>;

    constructor(options: IToolCallDeduplicatorOptions = {}) {
        this.cooldownMsByToolName = options.cooldownMsByToolName ?? {};
    }

    isDuplicate(toolName: string, args: Record<string, unknown>): boolean {
        const hash = createHash('sha256').update(JSON.stringify({ toolName, args })).digest('hex');
        const now = Date.now();
        const toolHashes = this.seenByToolName.get(toolName) ?? new Map<string, number>();
        const lastSeen = toolHashes.get(hash);
        const cooldownMs = this.cooldownMsByToolName[toolName] ?? 0;

        if (typeof lastSeen === 'number') {
            if (cooldownMs <= 0) return true;
            if (now - lastSeen < cooldownMs) return true;
        }

        toolHashes.set(hash, now);
        this.seenByToolName.set(toolName, toolHashes);
        return false;
    }
}
