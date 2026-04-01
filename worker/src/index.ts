import type { Env } from './types';
import { handleCron } from './crawler';

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(env));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/trigger') {
      ctx.waitUntil(handleCron(env));
      return new Response('Crawl triggered', { status: 200 });
    }
    return new Response('OK', { status: 200 });
  },
};
