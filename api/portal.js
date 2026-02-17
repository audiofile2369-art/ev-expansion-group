const { Client } = require("pg");
const { jwtVerify, createRemoteJWKSet } = require("jose");

const JWKS_URL = "https://ep-dawn-credit-aihwzzk3.neonauth.c-4.us-east-1.aws.neon.tech/neondb/auth/.well-known/jwks.json";
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL;

module.exports = async function handler(req, res) {
    res.setHeader("Content-Type", "application/json");
    const action = (req.query.action || "").toLowerCase();
    let body = {};
    try {
        if (typeof req.body === "string") {
            body = req.body ? JSON.parse(req.body) : {};
        } else if (req.body) {
            body = req.body;
        }
    } catch (err) {
        return res.status(400).json({ error: "Invalid JSON body" });
    }

    if (!connectionString) {
        return res.status(500).json({ error: "Database connection not configured" });
    }

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        await ensureTables(client);

        const user = await authenticate(req);
        if (!user) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        const userId = user.sub || user.id;

        if (action === "landmarks") {
            if (req.method === "GET") {
                return await listLandmarks(client, userId, res);
            }
            if (req.method === "POST") {
                return await saveLandmarks(client, userId, body, res);
            }
            if (req.method === "DELETE") {
                await client.query("DELETE FROM portal_landmarks WHERE user_id=$1", [userId]);
                return res.status(200).json({ ok: true });
            }
        }

        return res.status(404).json({ error: "Not found" });
    } catch (err) {
        console.error("API error", err);
        return res.status(500).json({ error: "Server error" });
    } finally {
        await client.end().catch(() => {});
    }
};

async function authenticate(req) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    try {
        const { payload } = await jwtVerify(token, jwks);
        return payload;
    } catch (err) {
        console.error("JWT verification failed", err.message);
        return null;
    }
}

async function ensureTables(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS portal_landmarks (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            grp TEXT DEFAULT 'general',
            source TEXT DEFAULT 'upload',
            created_at TIMESTAMPTZ DEFAULT now()
        );
    `);
}

async function listLandmarks(client, userId, res) {
    const rows = await client.query(
        "SELECT id, name, lat, lng, grp as \"group\", source FROM portal_landmarks WHERE user_id=$1 ORDER BY id",
        [userId]
    );
    return res.status(200).json({ landmarks: rows.rows });
}

async function saveLandmarks(client, userId, body, res) {
    const landmarks = Array.isArray(body.landmarks) ? body.landmarks : [];
    const cleaned = landmarks
        .map(lm => ({
            name: (lm.name || "").toString().trim(),
            lat: Number(lm.lat),
            lng: Number(lm.lng),
            group: (lm.group || "general").toString(),
            source: (lm.source || "upload").toString()
        }))
        .filter(lm => lm.name && !Number.isNaN(lm.lat) && !Number.isNaN(lm.lng));

    await client.query("BEGIN");
    await client.query("DELETE FROM portal_landmarks WHERE user_id=$1", [userId]);
    for (const lm of cleaned) {
        await client.query(
            "INSERT INTO portal_landmarks (user_id, name, lat, lng, grp, source) VALUES ($1,$2,$3,$4,$5,$6)",
            [userId, lm.name, lm.lat, lm.lng, lm.group, lm.source]
        );
    }
    await client.query("COMMIT");
    return res.status(200).json({ ok: true, count: cleaned.length });
}
