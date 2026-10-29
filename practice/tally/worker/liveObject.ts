// One Durable Object per group (named by the group code). It keeps the open WebSockets of the group page and
// forwards a signal {type:'changed'} to them. It stores nothing and never sees group data.
// Only worker/index.ts imports this file: Vitest runs in Node and cannot resolve 'cloudflare:workers'.
import { DurableObject } from 'cloudflare:workers';

export class GroupLive extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    // Answers keepalive pings without waking the object (Hibernation API).
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/connect') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/notify' && request.method === 'POST') {
      const message = JSON.stringify({ type: 'changed' });
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
        } catch {
          // A socket that is already closing is skipped; the others still get the signal.
        }
      }
      return new Response(null, { status: 204 });
    }

    return new Response('not found', { status: 404 });
  }

  // Clients only receive signals. Incoming messages are ignored.
  webSocketMessage(): void {}

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }
}
