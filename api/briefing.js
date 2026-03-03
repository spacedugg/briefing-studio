import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Ensure table exists (runs once per cold start)
let initialized = false;
async function init() {
  if (initialized) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS briefings (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      version INTEGER DEFAULT 1
    )
  `);
  // Add columns if they don't exist (for existing tables)
  try { await db.execute(`ALTER TABLE briefings ADD COLUMN updated_at TEXT DEFAULT (datetime('now'))`); } catch {}
  try { await db.execute(`ALTER TABLE briefings ADD COLUMN version INTEGER DEFAULT 1`); } catch {}
  initialized = true;
}

// Short ID: 8 chars, base62 (URL-safe, no ambiguous chars)
function generateId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let id = "";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 8; i++) id += chars[bytes[i] % chars.length];
  return id;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    await init();

    // GET /api/briefing?id=xxx — load briefing (includes version for change detection)
    // GET /api/briefing?list=recent — list recent briefings (metadata only)
    if (req.method === "GET") {
      const { id, list } = req.query;

      // List recent briefings (server-side history)
      if (list === "recent") {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const result = await db.execute({
          sql: `SELECT id,
            json_extract(data, '$.briefing.product.name') as name,
            json_extract(data, '$.briefing.product.brand') as brand,
            json_extract(data, '$.briefing.product.sku') as asin,
            json_extract(data, '$.briefing.product.marketplace') as marketplace,
            json_array_length(json_extract(data, '$.briefing.images')) as image_count,
            version, created_at, updated_at
          FROM briefings ORDER BY updated_at DESC LIMIT ?`,
          args: [limit],
        });
        const items = result.rows.map(row => ({
          id: row.id,
          name: row.name || "?",
          brand: row.brand || "",
          asin: row.asin || "",
          marketplace: row.marketplace || "",
          imageCount: row.image_count || 0,
          version: row.version || 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }));
        return res.status(200).json({ items });
      }

      if (!id) return res.status(400).json({ error: "Missing id" });

      const result = await db.execute({ sql: "SELECT data, version, updated_at FROM briefings WHERE id = ?", args: [id] });
      if (!result.rows.length) return res.status(404).json({ error: "Briefing not found" });

      const row = result.rows[0];
      return res.status(200).json({ id, data: JSON.parse(row.data), version: row.version || 1, updatedAt: row.updated_at || null });
    }

    // POST /api/briefing — save or update briefing
    if (req.method === "POST") {
      const body = req.body;
      if (!body?.briefing) return res.status(400).json({ error: "Missing briefing data" });

      const json = JSON.stringify(body);

      // If an existing ID is provided, update the briefing (increment version, store previous data for diff)
      if (body._updateId) {
        const existingId = body._updateId;
        const existing = await db.execute({ sql: "SELECT data, version FROM briefings WHERE id = ?", args: [existingId] });
        if (existing.rows.length) {
          const oldVersion = existing.rows[0].version || 1;
          const oldData = existing.rows[0].data;
          // Store previous version data for change detection (strip nested _previousData to prevent exponential growth)
          const newBody = { ...body };
          delete newBody._updateId;
          const oldParsed = JSON.parse(oldData);
          delete oldParsed._previousData;
          newBody._previousData = oldParsed;
          const newJson = JSON.stringify(newBody);
          await db.execute({
            sql: "UPDATE briefings SET data = ?, version = ?, updated_at = datetime('now') WHERE id = ?",
            args: [newJson, oldVersion + 1, existingId],
          });
          return res.status(200).json({ id: existingId, version: oldVersion + 1 });
        }
      }

      // Create new briefing
      const id = generateId();
      await db.execute({ sql: "INSERT INTO briefings (id, data) VALUES (?, ?)", args: [id, json] });
      return res.status(201).json({ id });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[briefing-api]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
