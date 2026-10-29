// Live updates on an open group page. The server sends only the signal {type:'changed'}; the page then reloads the
// group through the API. LiveConnection takes its WebSocket, timers and URL from outside, so it runs in Node tests.
import { useEffect, useRef } from 'react';

export const DEBOUNCE_MS = 250;
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 30000;

export interface SocketLike {
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
  readyState: number;
}

export interface LiveTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface LiveOptions {
  url: string;
  createSocket: (url: string) => SocketLike;
  timers?: LiveTimers;
  onSignal: () => void;
  /** Document-like object for visibilitychange; optional in tests. */
  doc?: { visibilityState: string; addEventListener(type: string, fn: () => void): void; removeEventListener(type: string, fn: () => void): void };
}

/** The live socket of one group page: debounced signals, reconnect with backoff, one reload after a drop. */
export class LiveConnection {
  private socket: SocketLike | null = null;
  private disposed = false;
  private dropped = false;
  private delay = BACKOFF_START_MS;
  private debounce: unknown = null;
  private retry: unknown = null;
  private readonly timers: LiveTimers;
  // Back in the foreground without a socket (or while waiting to retry): connect now and reload once.
  private readonly onVisible = () => {
    if (this.disposed || this.doc?.visibilityState !== 'visible') return;
    if (this.socket) return;
    this.clearRetry();
    this.dropped = false;
    this.connect();
    this.options.onSignal();
  };
  private readonly doc: LiveOptions['doc'];

  constructor(private readonly options: LiveOptions) {
    this.timers = options.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    };
    this.doc = options.doc;
    this.doc?.addEventListener('visibilitychange', this.onVisible);
    this.connect();
  }

  private connect() {
    if (this.disposed) return;
    const socket = this.options.createSocket(this.options.url);
    this.socket = socket;
    socket.onopen = () => {
      this.delay = BACKOFF_START_MS;
      if (this.dropped) {
        this.dropped = false;
        // The signals sent while the page was disconnected are lost: reload once so nothing is missed.
        this.options.onSignal();
      }
    };
    socket.onmessage = (ev) => {
      if (isChangedSignal(ev.data)) this.scheduleSignal();
    };
    socket.onclose = () => {
      if (this.disposed || this.socket !== socket) return;
      this.socket = null;
      this.dropped = true;
      this.scheduleRetry();
    };
  }

  private scheduleSignal() {
    if (this.debounce !== null) this.timers.clearTimeout(this.debounce);
    this.debounce = this.timers.setTimeout(() => {
      this.debounce = null;
      if (!this.disposed) this.options.onSignal();
    }, DEBOUNCE_MS);
  }

  private scheduleRetry() {
    this.clearRetry();
    const wait = this.delay;
    this.delay = Math.min(this.delay * 2, BACKOFF_MAX_MS);
    this.retry = this.timers.setTimeout(() => {
      this.retry = null;
      this.connect();
    }, wait);
  }

  private clearRetry() {
    if (this.retry !== null) {
      this.timers.clearTimeout(this.retry);
      this.retry = null;
    }
  }

  dispose() {
    this.disposed = true;
    this.clearRetry();
    if (this.debounce !== null) {
      this.timers.clearTimeout(this.debounce);
      this.debounce = null;
    }
    this.doc?.removeEventListener('visibilitychange', this.onVisible);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

/** Only the exact {type:'changed'} message counts. Anything else is ignored. */
export function isChangedSignal(data: unknown): boolean {
  if (typeof data !== 'string') return false;
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === 'object' && parsed !== null && (parsed as { type?: unknown }).type === 'changed';
  } catch {
    return false;
  }
}

/** The WebSocket URL of a group's live endpoint: wss on https pages, ws otherwise. */
export function liveUrl(code: string, loc: { protocol: string; host: string }): string {
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${loc.host}/api/groups/${code}/live`;
}

/** Keeps the group page live for `code`; `onSignal` is called when the group may have changed. */
export function useGroupLive(code: string, onSignal: () => void): void {
  const signalRef = useRef(onSignal);

  useEffect(() => {
    signalRef.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (typeof WebSocket === 'undefined') return;
    const connection = new LiveConnection({
      url: liveUrl(code, location),
      createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      onSignal: () => signalRef.current(),
      doc: document,
    });
    return () => connection.dispose();
  }, [code]);
}
