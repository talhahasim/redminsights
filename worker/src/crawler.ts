import { createClient } from '@supabase/supabase-js';
import type { Env, ServerInfo } from './types';

// ── Protobuf Parsing ──

function stripColors(str: string): string {
  return str.replace(/\^[0-9]/g, '').replace(/~[a-zA-Z]~/g, '').trim();
}

function readVarint(buffer: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < buffer.length && shift < 35) {
    const byte = buffer[pos];
    result |= (byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result >>> 0, pos];
}

function decodeSignedVarint(value: number): number {
  return (value >>> 1) ^ -(value & 1);
}

function parseVarsField(data: Uint8Array, vars: Record<string, string>): void {
  let offset = 0;
  let key = '';
  let value = '';
  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x7;
    if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      if (offset + length > data.length) break;
      const text = new TextDecoder().decode(data.subarray(offset, offset + length));
      offset += length;
      if (fieldNumber === 1) key = text;
      else if (fieldNumber === 2) value = text;
    } else break;
  }
  if (key) vars[key] = value;
}

function parseDataMessage(data: Uint8Array, serverData: Record<string, unknown>): void {
  let offset = 0;
  const vars: Record<string, string> = {};
  while (offset < data.length) {
    const [tag, newOffset] = readVarint(data, offset);
    offset = newOffset;
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x7;
    if (wireType === 2) {
      const [length, lenOffset] = readVarint(data, offset);
      offset = lenOffset;
      if (offset + length > data.length) break;
      const fieldData = data.subarray(offset, offset + length);
      offset += length;
      const text = new TextDecoder().decode(fieldData);
      switch (fieldNumber) {
        case 4: serverData.hostname = text; break;
        case 5: serverData.gametype = text; break;
        case 6: serverData.mapname = text; break;
        case 9: serverData.server = text; break;
        case 12: parseVarsField(fieldData, vars); break;
        case 18: serverData.addr = text; break;
      }
    } else if (wireType === 0) {
      const [value, valOffset] = readVarint(data, offset);
      offset = valOffset;
      switch (fieldNumber) {
        case 1: serverData.clients = value; break;
        case 11: {
          const signed = decodeSignedVarint(value);
          serverData.svMaxclients = signed > 0 ? signed : value;
          break;
        }
      }
    } else {
      if (wireType === 5) offset += 4;
      else if (wireType === 1) offset += 8;
      else break;
    }
  }
  serverData.vars = vars;
}

function parseServerEntry(data: Uint8Array): { endPoint: string; serverData: Record<string, unknown> } | null {
  try {
    let offset = 0;
    let endPoint = '';
    const serverData: Record<string, unknown> = { vars: {} };
    while (offset < data.length) {
      const [tag, newOffset] = readVarint(data, offset);
      offset = newOffset;
      const fieldNumber = tag >> 3;
      const wireType = tag & 0x7;
      if (wireType === 2) {
        const [length, lenOffset] = readVarint(data, offset);
        offset = lenOffset;
        if (offset + length > data.length) break;
        const fieldData = data.subarray(offset, offset + length);
        offset += length;
        if (fieldNumber === 1) endPoint = new TextDecoder().decode(fieldData);
        else if (fieldNumber === 2) parseDataMessage(fieldData, serverData);
      } else if (wireType === 0) {
        const [value, valOffset] = readVarint(data, offset);
        offset = valOffset;
        if (fieldNumber === 3) serverData.clients = value;
        if (fieldNumber === 4) serverData.svMaxclients = value;
      } else break;
    }
    return endPoint ? { endPoint, serverData } : null;
  } catch {
    return null;
  }
}

// ── Main Crawl Function ──

export async function handleCron(env: Env): Promise<void> {
  const crawlStart = new Date().toISOString();
  console.log('Starting crawl...');

  // 1. Fetch servers from protobuf stream
  const timestamp = Date.now();
  const response = await fetch(
    `https://frontend.cfx-services.net/api/servers/stream/${timestamp}/`,
    {
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    }
  );

  if (!response.ok) {
    console.error(`Stream API returned ${response.status}`);
    return;
  }

  const buffer = await response.arrayBuffer();
  const data = new Uint8Array(buffer);
  const servers: ServerInfo[] = [];
  let offset = 0;

  while (offset < data.length) {
    if (offset + 4 > data.length) break;
    const length = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
    offset += 4;
    if (length <= 0 || length > 100000 || offset + length > data.length) break;
    const entryData = data.subarray(offset, offset + length);
    offset += length;

    const entry = parseServerEntry(entryData);
    if (!entry) continue;

    const { endPoint, serverData } = entry;
    const vars = (serverData.vars || {}) as Record<string, string>;
    if (vars.gamename !== 'rdr3') continue;

    let maxClients = Number(serverData.svMaxclients) || 0;
    if (maxClients < 0 || maxClients > 10000) maxClients = 0;
    const clients = Number(serverData.clients) || 0;

    servers.push({
      id: endPoint,
      hostname: stripColors(String(serverData.hostname || '')),
      clients,
      sv_maxclients: maxClients || clients,
      gametype: String(serverData.gametype || ''),
      mapname: String(serverData.mapname || ''),
      project_name: stripColors(vars.sv_projectName || ''),
      project_desc: stripColors(vars.sv_projectDesc || ''),
      tags: vars.tags || '',
      locale: vars.locale || '',
      banner_detail: vars.banner_detail || '',
      addr: String(serverData.addr || ''),
    });
  }

  console.log(`Parsed ${servers.length} RedM servers`);

  if (servers.length === 0) {
    console.error('No servers found');
    return;
  }

  // 2. Write to Supabase
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Upsert in batches of 100
  const UPSERT_BATCH_SIZE = 100;
  for (let i = 0; i < servers.length; i += UPSERT_BATCH_SIZE) {
    const batch = servers.slice(i, i + UPSERT_BATCH_SIZE).map((s) => ({
      ...s,
      updated_at: crawlStart,
    }));

    const { error } = await supabase
      .from('servers')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`Upsert error (batch ${i}): ${error.message}`);
      return;
    }
  }

  // 3. Delete stale servers (not seen in this crawl)
  const { error: deleteError } = await supabase
    .from('servers')
    .delete()
    .lt('updated_at', crawlStart);

  if (deleteError) {
    console.error(`Delete stale error: ${deleteError.message}`);
  }

  console.log(`Crawl complete: ${servers.length} servers written to DB`);
  // Enrichment runs separately via pg_cron at :05 each hour
}
