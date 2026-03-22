import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "./db.js";

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, fullName, requestedRole } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const existing = await query("SELECT id FROM profiles WHERE email = $1", [email]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ error: "User with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO profiles (email, full_name, role, is_blocked, password_hash)
       VALUES ($1, $2, 'user', false, $3)
       RETURNING id, email, full_name, role, is_blocked, created_at`,
      [email, fullName || null, passwordHash],
    );

    const profile = result.rows[0];

    if (requestedRole && requestedRole !== "user") {
      await query(
        `INSERT INTO registration_requests (email, full_name, role_requested, status)
         VALUES ($1, $2, $3, 'pending')`,
        [email, fullName || null, requestedRole],
      );
    }

    const token = signToken({ id: profile.id, email: profile.email, role: profile.role });

    return res.status(201).json({ token, profile });
  } catch (err) {
    console.error("Register error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const result = await query(
      `SELECT id, email, full_name, role, is_blocked, created_at, password_hash
       FROM profiles
       WHERE email = $1`,
      [email],
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const profile = result.rows[0];

    const valid = await bcrypt.compare(password, profile.password_hash || "");
    if (!valid) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    if (profile.is_blocked) {
      return res.status(403).json({ error: "Ваш аккаунт заблокирован администратором." });
    }

    delete profile.password_hash;
    profile.is_blocked = Boolean(profile.is_blocked);

    const token = signToken({ id: profile.id, email: profile.email, role: profile.role });

    return res.json({ token, profile });
  } catch (err) {
    console.error("Login error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await query(
      `SELECT id, email, full_name, role, is_blocked, created_at
       FROM profiles
       WHERE id = $1`,
      [userId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    const profile = result.rows[0];
    profile.is_blocked = Boolean(profile.is_blocked);
    return res.json({ profile });
  } catch (err) {
    console.error("Me error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
