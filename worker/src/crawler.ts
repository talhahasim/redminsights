import type { Env, CrawlData } from './types';

const CRAWL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function handleCron(env: Env): Promise<void> {
  // Check if data is still fresh
  const existing = await env.KV.get('data:latest');
  if (existing) {
    const data: CrawlData = JSON.parse(existing);
    const age = Date.now() - new Date(data.meta.cachedAt).getTime();
    if (age < CRAWL_INTERVAL_MS) {
      return; // Still fresh
    }
  }

  console.log('Calling Vercel crawl endpoint...');

  // Vercel does all heavy lifting: protobuf parsing + resource enrichment
  const res = await fetch(env.CRAWL_URL, {
    signal: AbortSignal.timeout(55000), // Vercel has 60s max
    headers: { 'User-Agent': 'RedMInsights-Worker/1.0' },
  });

  if (!res.ok) {
    console.error(`Crawl endpoint returned ${res.status}`);
    return;
  }

  const data: CrawlData = await res.json();

  if (!data.servers || data.servers.length === 0) {
    console.error('No servers returned from crawl');
    return;
  }

  // Backup current data
  if (existing) {
    await env.KV.put('data:previous', existing);
  }

  await env.KV.put('data:latest', JSON.stringify(data));
  console.log(`Updated: ${data.meta.serverCount} servers, ${data.meta.serversWithResources} enriched, ${data.meta.resourceCount} resources`);
}
