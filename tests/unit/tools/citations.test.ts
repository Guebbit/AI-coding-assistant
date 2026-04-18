import { describe, expect, it } from 'vitest';
import { ToolCitationBuffer, toolCitationSchema } from '@/packages/tools/citations.js';

describe('tool citations', () => {
    it('validates citation objects', () => {
        const parsed = toolCitationSchema.safeParse({ id: '1', title: 'T', text: 'Body' });
        expect(parsed.success).toBe(true);
    });

    it('buffers and flushes citations in insertion order', () => {
        const buffer = new ToolCitationBuffer();
        buffer.add({ id: '1', title: 'One', text: 'First' });
        buffer.add({ id: '2', title: 'Two', text: 'Second' });
        expect(buffer.peek()).toHaveLength(2);
        expect(buffer.flush()).toEqual([
            { id: '1', title: 'One', text: 'First' },
            { id: '2', title: 'Two', text: 'Second' }
        ]);
        expect(buffer.peek()).toEqual([]);
    });
});
