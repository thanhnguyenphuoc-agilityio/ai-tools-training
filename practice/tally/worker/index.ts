import { createApp, type Env } from './app';

const app = createApp();

// Only /api/* reaches the Worker (see run_worker_first in wrangler.jsonc);
// everything else is served from the built web app.
export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
