-- RedM Insights - Supabase Schema
-- Run this in Supabase SQL Editor

-- Servers table (upserted on each crawl)
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL DEFAULT '',
  clients INTEGER NOT NULL DEFAULT 0,
  sv_maxclients INTEGER NOT NULL DEFAULT 0,
  gametype TEXT NOT NULL DEFAULT '',
  mapname TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  project_desc TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT '',
  banner_detail TEXT NOT NULL DEFAULT '',
  addr TEXT NOT NULL DEFAULT '',
  resources TEXT[] NOT NULL DEFAULT '{}',
  resource_count INTEGER NOT NULL DEFAULT 0,
  enrich_fail_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_servers_clients ON servers(clients DESC);
CREATE INDEX IF NOT EXISTS idx_servers_resource_count ON servers(resource_count DESC);
CREATE INDEX IF NOT EXISTS idx_servers_resources ON servers USING GIN(resources);
CREATE INDEX IF NOT EXISTS idx_servers_updated_at ON servers(updated_at);

-- RLS: public read, only service_role can write
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON servers FOR SELECT USING (true);

-- Resource stats view (auto-computed from servers)
CREATE OR REPLACE VIEW resource_stats AS
SELECT
  name,
  server_count,
  total_players,
  ROW_NUMBER() OVER (ORDER BY server_count DESC, name ASC)::integer AS global_rank
FROM (
  SELECT
    unnest(resources) AS name,
    COUNT(*)::integer AS server_count,
    SUM(clients)::integer AS total_players
  FROM servers
  WHERE resource_count > 0
  GROUP BY 1
) sub;

-- Meta function
CREATE OR REPLACE FUNCTION get_meta()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  SELECT json_build_object(
    'serverCount', COALESCE((SELECT COUNT(*) FROM servers), 0),
    'serversWithResources', COALESCE((SELECT COUNT(*) FROM servers WHERE resource_count > 0), 0),
    'resourceCount', COALESCE((SELECT COUNT(DISTINCT r) FROM servers, unnest(resources) r WHERE resource_count > 0), 0),
    'totalPlayers', COALESCE((SELECT SUM(clients) FROM servers), 0),
    'cachedAt', COALESCE((SELECT MAX(updated_at) FROM servers), NOW())
  );
$$;
