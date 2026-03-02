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
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
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

    // GET /api/briefing?id=xxx — load briefing
    if (req.method === "GET") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "Missing id" });

      const result = await db.execute({ sql: "SELECT data FROM briefings WHERE id = ?", args: [id] });
      if (!result.rows.length) return res.status(404).json({ error: "Briefing not found" });

      return res.status(200).json({ id, data: JSON.parse(result.rows[0].data) });
    }

    // POST /api/briefing — save briefing, return short ID
    if (req.method === "POST") {
      const body = req.body;
      if (!body?.briefing) return res.status(400).json({ error: "Missing briefing data" });

      const id = generateId();
      const json = JSON.stringify(body);

      await db.execute({ sql: "INSERT INTO briefings (id, data) VALUES (?, ?)", args: [id, json] });

      return res.status(201).json({ id });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("[briefing-api]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
