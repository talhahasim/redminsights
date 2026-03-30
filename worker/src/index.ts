import type { Env } from './types';
import { handleCron } from './crawler';
import { handleAPI } from './api';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleAPI(request, env);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env));
  },
};
