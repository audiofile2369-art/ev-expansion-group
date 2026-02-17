const { Client } = require("pg");
const crypto = require("crypto");
const util = require("util");

const scryptAsync = util.promisify(crypto.scrypt);
const tokenSecret = process.env.PORTAL_TOKEN_SECRET || "dev-portal-secret";
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

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

        if (action === "register" && req.method === "POST") {
            return await handleRegister(client, body, res);
        }

        if (action === "login" && req.method === "POST") {
            return await handleLogin(client, body, res);
        }

        const email = authenticate(req);
        if (!email) {
            return res.status(401).json({ error: "Unauthorized" });
        }

        if (action === "landmarks") {
            if (req.method === "GET") {
                return await listLandmarks(client, email, res);
            }
            if (req.method === "POST") {
                return await saveLandmarks(client, email, body, res);
            }
            if (req.method === "DELETE") {
                await client.query("DELETE FROM portal_landmarks WHERE user_email=$1", [email]);
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

function authenticate(req) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    return verifyToken(token);
}

function signToken(email) {
    const hmac = crypto.createHmac("sha256", tokenSecret).update(email).digest("hex");
    return `${email}:${hmac}`;
}

function verifyToken(token) {
    const [email, sig] = (token || "").split(":");
    if (!email || !sig) return null;
    const expected = crypto.createHmac("sha256", tokenSecret).update(email).digest("hex");
    try {
        if (crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
            return email;
        }
    } catch {
        return null;
    }
    return null;
}

async function ensureTables(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS portal_users (
            id BIGSERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now()
        );
    `);
    await client.query(`
        CREATE TABLE IF NOT EXISTS portal_landmarks (
            id BIGSERIAL PRIMARY KEY,
            user_email TEXT NOT NULL REFERENCES portal_users(email) ON DELETE CASCADE,
            name TEXT NOT NULL,
            lat DOUBLE PRECISION NOT NULL,
            lng DOUBLE PRECISION NOT NULL,
            grp TEXT DEFAULT 'general',
            source TEXT DEFAULT 'upload',
            created_at TIMESTAMPTZ DEFAULT now()
        );
    `);
}

async function handleRegister(client, body, res) {
    const email = (body.email || "").toLowerCase().trim();
    const password = body.password || "";
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
    }
    const existing = await client.query("SELECT 1 FROM portal_users WHERE email=$1", [email]);
    if (existing.rowCount) {
        return res.status(409).json({ error: "User already exists" });
    }
    const salt = crypto.randomBytes(16).toString("hex");
    const derived = await scryptAsync(password, salt, 64);
    const hash = Buffer.from(derived).toString("hex");
    await client.query(
        "INSERT INTO portal_users (email, password_hash, password_salt) VALUES ($1,$2,$3)",
        [email, hash, salt]
    );
    return res.status(200).json({ token: signToken(email) });
}

async function handleLogin(client, body, res) {
    const email = (body.email || "").toLowerCase().trim();
    const password = body.password || "";
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
    }
    const user = await client.query(
        "SELECT password_hash, password_salt FROM portal_users WHERE email=$1",
        [email]
    );
    if (!user.rowCount) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const { password_hash: storedHash, password_salt: salt } = user.rows[0];
    const derived = await scryptAsync(password, salt, 64);
    const hash = Buffer.from(derived).toString("hex");
    if (hash !== storedHash) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    return res.status(200).json({ token: signToken(email) });
}

async function listLandmarks(client, email, res) {
    const rows = await client.query(
        "SELECT id, name, lat, lng, grp as \"group\", source FROM portal_landmarks WHERE user_email=$1 ORDER BY id",
        [email]
    );
    return res.status(200).json({ landmarks: rows.rows });
}

async function saveLandmarks(client, email, body, res) {
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
    await client.query("DELETE FROM portal_landmarks WHERE user_email=$1", [email]);
    for (const lm of cleaned) {
        await client.query(
            "INSERT INTO portal_landmarks (user_email, name, lat, lng, grp, source) VALUES ($1,$2,$3,$4,$5,$6)",
            [email, lm.name, lm.lat, lm.lng, lm.group, lm.source]
        );
    }
    await client.query("COMMIT");
    return res.status(200).json({ ok: true, count: cleaned.length });
}
