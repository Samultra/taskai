import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Backend will not be able to connect to PostgreSQL.");
}

/** Парсинг хоста из postgres URL (для Render/Supabase без sslmode= в строке). */
function postgresHostname(cs) {
  try {
    const u = new URL(cs.replace(/^postgres(ql)?:/, "http:"));
    return u.hostname || "";
  } catch {
    return "";
  }
}

/**
 * Удалённый Postgres (Supabase и т.д.): цепочка сертификатов часто не проходит verify-full в Node.
 * Для localhost без sslmode в URL — без объекта ssl (локальный Postgres без TLS).
 */
function poolOptions() {
  const base = { connectionString };
  if (!connectionString) return base;
  const host = postgresHostname(connectionString);
  const local = host === "localhost" || host === "127.0.0.1";
  const urlWantsSsl =
    /sslmode=require|sslmode=verify-full|sslmode=verify-ca/i.test(connectionString) ||
    /[?&]ssl=true/i.test(connectionString);
  if (local && !urlWantsSsl) return base;
  return { ...base, ssl: { rejectUnauthorized: false } };
}

export const pool = new Pool(poolOptions());

export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV !== "test") {
    console.log("executed query", { text, duration, rows: res.rowCount });
  }
  return res;
}

export async function getClient() {
  return pool.connect();
}
