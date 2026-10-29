import { createApp, type Env } from './app';
import { runDailyJobs } from './cleanup';

// The Durable Object class must be exported from the entry module (group_live_updates).
export { GroupLive } from './liveObject';

const app = createApp();

// Only /api/* reaches the Worker (see run_worker_first in wrangler.jsonc);
// everything else is served from the built web app.
export default {
  fetch: app.fetch,
  scheduled: async (controller, env, _ctx?: ExecutionContext) => {
    await runDailyJobs(env, new Date(controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
