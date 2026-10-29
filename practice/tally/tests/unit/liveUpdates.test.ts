import { describe, expect, it } from 'vitest';
import { DEBOUNCE_MS, isChangedSignal, LiveConnection, liveUrl, type SocketLike } from '../../src/liveUpdates';

// A fake WebSocket: the test drives open, message and close by hand.
class FakeSocket implements SocketLike {
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  readyState = 0;
  closed = false;
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  message(data: unknown) {
    this.onmessage?.({ data });
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

// Fake timers: setTimeout records the callback; advance(ms) runs everything due.
function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        const id = nextId++;
        pending.set(id, { at: now + ms, fn });
        return id;
      },
      clearTimeout: (id: unknown) => {
        pending.delete(id as number);
      },
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...pending.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        pending.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
    count: () => pending.size,
  };
}

function harness() {
  const sockets: FakeSocket[] = [];
  const clock = fakeTimers();
  let signals = 0;
  const listeners = new Map<string, () => void>();
  const doc = {
    visibilityState: 'visible',
    addEventListener: (type: string, fn: () => void) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const connection = new LiveConnection({
    url: 'ws://test/api/groups/x/live',
    createSocket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    timers: clock.timers,
    onSignal: () => signals++,
    doc,
  });
  return {
    connection,
    sockets,
    clock,
    signals: () => signals,
    current: () => sockets[sockets.length - 1],
    visibility: (state: 'visible' | 'hidden') => {
      doc.visibilityState = state;
      listeners.get('visibilitychange')?.();
    },
    hasVisibilityListener: () => listeners.has('visibilitychange'),
  };
}

describe('LiveConnection', () => {
  it('debounces several signals within the debounce window into one reload', () => {
    const h = harness();
    h.current().open();
    h.current().message('{"type":"changed"}');
    h.clock.advance(100);
    h.current().message('{"type":"changed"}');
    h.clock.advance(100);
    h.current().message('{"type":"changed"}');
    expect(h.signals()).toBe(0);
    h.clock.advance(DEBOUNCE_MS);
    expect(h.signals()).toBe(1);
  });

  it('ignores messages that are not exactly type changed', () => {
    const h = harness();
    h.current().open();
    h.current().message('{"type":"other"}');
    h.current().message('not json');
    h.current().message('{"type":"changed","data":{"name":"x"}}');
    h.clock.advance(DEBOUNCE_MS * 2);
    expect(h.signals()).toBe(1);
    expect(isChangedSignal('{"type":"other"}')).toBe(false);
    expect(isChangedSignal(42)).toBe(false);
  });

  it('reconnects with backoff: 1 s, 2 s, 4 s, capped at 30 s', () => {
    const h = harness();
    h.current().open();
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    for (const delay of delays) {
      const before = h.sockets.length;
      h.current().drop();
      h.clock.advance(delay - 1);
      expect(h.sockets.length).toBe(before);
      h.clock.advance(1);
      expect(h.sockets.length).toBe(before + 1);
    }
  });

  it('after a reconnect that follows a drop, reloads exactly once', () => {
    const h = harness();
    h.current().open();
    h.current().drop();
    expect(h.signals()).toBe(0);
    h.clock.advance(1000);
    h.current().open();
    expect(h.signals()).toBe(1);
    h.clock.advance(60_000);
    expect(h.signals()).toBe(1);
  });

  it('a first connection that opens does not reload', () => {
    const h = harness();
    h.current().open();
    expect(h.signals()).toBe(0);
  });

  it('on visibilitychange to visible without a socket: connects and reloads exactly once', () => {
    const h = harness();
    h.current().open();
    h.current().drop();
    // The retry is pending; the tab comes back before it fires.
    h.visibility('visible');
    expect(h.sockets.length).toBe(2);
    expect(h.signals()).toBe(1);
    // The retry timer was cleared, so no second socket is opened later.
    h.clock.advance(60_000);
    expect(h.sockets.length).toBe(2);
  });

  it('on visibilitychange with a socket already open, does nothing', () => {
    const h = harness();
    h.current().open();
    h.visibility('visible');
    expect(h.sockets.length).toBe(1);
    expect(h.signals()).toBe(0);
  });

  it('on visibilitychange to hidden, does nothing', () => {
    const h = harness();
    h.current().open();
    h.current().drop();
    h.visibility('hidden');
    expect(h.sockets.length).toBe(1);
    expect(h.signals()).toBe(0);
  });

  it('dispose closes the socket, cancels timers and stops reconnecting', () => {
    const h = harness();
    h.current().open();
    h.current().message('{"type":"changed"}');
    h.current().drop();
    h.connection.dispose();
    expect(h.clock.count()).toBe(0);
    h.clock.advance(60_000);
    expect(h.sockets.length).toBe(1);
    expect(h.signals()).toBe(0);
    expect(h.hasVisibilityListener()).toBe(false);
  });

  it('dispose closes an open socket', () => {
    const h = harness();
    h.current().open();
    h.connection.dispose();
    expect(h.current().closed).toBe(true);
  });
});

describe('liveUrl', () => {
  it('uses wss on https and ws otherwise', () => {
    expect(liveUrl('abcd-efgh-jkmn', { protocol: 'https:', host: 'tally.example' })).toBe(
      'wss://tally.example/api/groups/abcd-efgh-jkmn/live',
    );
    expect(liveUrl('abcd-efgh-jkmn', { protocol: 'http:', host: 'localhost:5173' })).toBe(
      'ws://localhost:5173/api/groups/abcd-efgh-jkmn/live',
    );
  });
});
