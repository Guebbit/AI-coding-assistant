import { describe, expect, it, vi } from 'vitest';
import { ToolCallDeduplicator } from '@/packages/tools/tool-call-deduplicator.js';

describe('ToolCallDeduplicator', () => {
    it('marks identical tool name + args calls as duplicates', () => {
        const deduplicator = new ToolCallDeduplicator();
        expect(deduplicator.isDuplicate('read_file', { path: 'a.txt' })).toBe(false);
        expect(deduplicator.isDuplicate('read_file', { path: 'a.txt' })).toBe(true);
    });

    it('respects per-tool cooldown when configured', () => {
        const nowSpy = vi.spyOn(Date, 'now');
        nowSpy.mockReturnValue(1000);
        const deduplicator = new ToolCallDeduplicator({
            cooldownMsByToolName: { read_file: 100 }
        });

        expect(deduplicator.isDuplicate('read_file', { path: 'a.txt' })).toBe(false);
        nowSpy.mockReturnValue(1050);
        expect(deduplicator.isDuplicate('read_file', { path: 'a.txt' })).toBe(true);
        nowSpy.mockReturnValue(1200);
        expect(deduplicator.isDuplicate('read_file', { path: 'a.txt' })).toBe(false);

        nowSpy.mockRestore();
    });
});
