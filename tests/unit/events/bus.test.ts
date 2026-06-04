/**
 * Unit tests for packages/events/bus.ts
 *
 * Tests the minimal in-process event bus: subscribe (on), unsubscribe (off),
 * emit (typed + wildcard), and error isolation across handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Reset module state between tests to avoid handler leakage. */
let on: (typeof import('../../../packages/events/bus.js'))['on'];
let off: (typeof import('../../../packages/events/bus.js'))['off'];
let emit: (typeof import('../../../packages/events/bus.js'))['emit'];

beforeEach(async () => {
    /* Force a fresh module instance per test so the handlers Map is clean. */
    vi.resetModules();
    const bus = await import('../../../packages/events/bus.js');
    on = bus.on;
    off = bus.off;
    emit = bus.emit;
});

describe('on / emit — typed subscription', () => {
    it('calls a handler when a matching event is emitted', () => {
        const handler = vi.fn();
        on('agent:start', handler);
        emit({ type: 'agent:start', payload: { task: 'test' } });
        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith({ type: 'agent:start', payload: { task: 'test' } });
    });

    it('does not call a handler for a different event type', () => {
        const handler = vi.fn();
        on('agent:done', handler);
        emit({ type: 'agent:start', payload: {} });
        expect(handler).not.toHaveBeenCalled();
    });

    it('calls all handlers registered for the same event type', () => {
        const h1 = vi.fn();
        const h2 = vi.fn();
        on('tool:result', h1);
        on('tool:result', h2);
        emit({ type: 'tool:result', payload: { result: 'ok' } });
        expect(h1).toHaveBeenCalledOnce();
        expect(h2).toHaveBeenCalledOnce();
    });

    it('calls a handler multiple times when the same event is emitted twice', () => {
        const handler = vi.fn();
        on('agent:step', handler);
        emit({ type: 'agent:step', payload: { step: 1 } });
        emit({ type: 'agent:step', payload: { step: 2 } });
        expect(handler).toHaveBeenCalledTimes(2);
    });
});

describe('off — unsubscribe', () => {
    it('removes a previously registered handler', () => {
        const handler = vi.fn();
        on('agent:error', handler);
        off('agent:error', handler);
        emit({ type: 'agent:error', payload: {} });
        expect(handler).not.toHaveBeenCalled();
    });

    it('only removes the specific handler, leaving others intact', () => {
        const h1 = vi.fn();
        const h2 = vi.fn();
        on('tool:error', h1);
        on('tool:error', h2);
        off('tool:error', h1);
        emit({ type: 'tool:error', payload: {} });
        expect(h1).not.toHaveBeenCalled();
        expect(h2).toHaveBeenCalledOnce();
    });

    it('does nothing when removing a handler that was never registered', () => {
        const handler = vi.fn();
        expect(() => off('nonexistent:event', handler)).not.toThrow();
    });
});

describe('wildcard "*" subscription', () => {
    it('receives every event regardless of type', () => {
        const handler = vi.fn();
        on('*', handler);
        emit({ type: 'agent:start', payload: {} });
        emit({ type: 'tool:result', payload: {} });
        emit({ type: 'agent:done', payload: {} });
        expect(handler).toHaveBeenCalledTimes(3);
    });

    it('receives both typed-handler events and wildcard events', () => {
        const typed = vi.fn();
        const wildcard = vi.fn();
        on('agent:done', typed);
        on('*', wildcard);
        emit({ type: 'agent:done', payload: { answer: '42' } });
        expect(typed).toHaveBeenCalledOnce();
        expect(wildcard).toHaveBeenCalledOnce();
    });
});

describe('error isolation', () => {
    it('continues calling subsequent handlers when one handler throws', () => {
        const bad = vi.fn(() => {
            throw new Error('handler error');
        });
        const good = vi.fn();
        on('agent:start', bad);
        on('agent:start', good);
        /* Should not throw even though 'bad' throws. */
        expect(() => emit({ type: 'agent:start', payload: {} })).not.toThrow();
        expect(bad).toHaveBeenCalledOnce();
        expect(good).toHaveBeenCalledOnce();
    });

    it('does not propagate errors from wildcard handlers', () => {
        const bad = vi.fn(() => {
            throw new Error('wildcard error');
        });
        on('*', bad);
        expect(() => emit({ type: 'anything', payload: {} })).not.toThrow();
    });
});
