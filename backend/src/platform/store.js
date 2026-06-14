const fs = require("node:fs");
const path = require("node:path");

const seedPath = path.join(__dirname, "..", "..", "data", "seed.json");
const runtimeSchemaSql = `
CREATE SCHEMA IF NOT EXISTS runtime;
CREATE TABLE IF NOT EXISTS runtime.collection_items (
  collection text NOT NULL,
  id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS idx_collection_items_collection ON runtime.collection_items(collection);
`;

function loadSeed() {
  return JSON.parse(fs.readFileSync(seedPath, "utf8"));
}

async function createPostgresAdapter(databaseUrl) {
  if (!databaseUrl) return null;
  let pg;
  try {
    pg = require("pg");
  } catch (error) {
    const wrapped = new Error("DATABASE_URL is set but package 'pg' is not installed. Run npm install before enabling PostgreSQL persistence.");
    wrapped.cause = error;
    throw wrapped;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  await pool.query(runtimeSchemaSql);
  return {
    mode: "postgres",
    async load(seed) {
      const count = await pool.query("SELECT COUNT(*)::int AS count FROM runtime.collection_items");
      if (count.rows[0].count === 0) {
        for (const [collection, items] of Object.entries(seed)) {
          if (!Array.isArray(items)) continue;
          for (const item of items) {
            await pool.query(
              `INSERT INTO runtime.collection_items(collection, id, data)
               VALUES ($1, $2, $3::jsonb)
               ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
              [collection, item.id || `${collection}_${Date.now()}_${Math.random()}`, JSON.stringify(item)],
            );
          }
        }
      }
      const result = await pool.query("SELECT collection, data FROM runtime.collection_items ORDER BY collection, created_at");
      const state = {};
      for (const row of result.rows) {
        if (!state[row.collection]) state[row.collection] = [];
        state[row.collection].push(row.data);
      }
      for (const [collection, items] of Object.entries(seed)) {
        if (!state[collection] && Array.isArray(items)) state[collection] = [];
      }
      return state;
    },
    persistInsert(collection, item) {
      return pool
        .query(
          `INSERT INTO runtime.collection_items(collection, id, data)
           VALUES ($1, $2, $3::jsonb)
           ON CONFLICT (collection, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [collection, item.id, JSON.stringify(item)],
        )
        .catch((error) => console.error(`PostgreSQL insert failed for ${collection}/${item.id}:`, error.message));
    },
    persistUpdate(collection, item) {
      return pool
        .query("UPDATE runtime.collection_items SET data = $3::jsonb, updated_at = now() WHERE collection = $1 AND id = $2", [
          collection,
          item.id,
          JSON.stringify(item),
        ])
        .catch((error) => console.error(`PostgreSQL update failed for ${collection}/${item.id}:`, error.message));
    },
    async close() {
      await pool.end();
    },
  };
}

async function createStore() {
  const state = loadSeed();
  const adapter = await createPostgresAdapter(process.env.DATABASE_URL);
  const runtimeState = adapter ? await adapter.load(state) : state;

  return {
    state: runtimeState,
    mode: adapter?.mode || "memory",
    list(collection) {
      return runtimeState[collection] || [];
    },
    find(collection, id) {
      return this.list(collection).find((item) => item.id === id);
    },
    findBy(collection, key, value) {
      return this.list(collection).find((item) => item[key] === value);
    },
    update(collection, id, patch) {
      const items = this.list(collection);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return null;
      items[index] = { ...items[index], ...patch, updatedAt: new Date().toISOString() };
      if (adapter) adapter.persistUpdate(collection, items[index]);
      return items[index];
    },
    insert(collection, item) {
      if (!runtimeState[collection]) runtimeState[collection] = [];
      runtimeState[collection].push(item);
      if (adapter) adapter.persistInsert(collection, item);
      return item;
    },
    async close() {
      if (adapter) await adapter.close();
    },
  };
}

module.exports = { createStore };
