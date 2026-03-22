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
 * pg 8.x + pg-connection-string: sslmode в URI трактуется как verify-full и может перебить
 * ssl: { rejectUnauthorized: false }. Убираем ssl-параметры из строки и задаём TLS только объектом.
 */
function stripSslParamsFromConnectionString(cs) {
  try {
    const u = new URL(cs.replace(/^postgres(ql)?:/, "http:"));
    for (const k of ["sslmode", "ssl", "uselibpqcompat"]) u.searchParams.delete(k);
    const proto = /^postgresql:/i.test(cs) ? "postgresql:" : "postgres:";
    const user = u.username ? encodeURIComponent(u.username) : "";
    const pass = u.password ? encodeURIComponent(u.password) : "";
    const auth = user ? `${user}${pass ? `:${pass}` : ""}@` : "";
    const port = u.port ? `:${u.port}` : "";
    const qs = u.searchParams.toString();
    const q = qs ? `?${qs}` : "";
    return `${proto}//${auth}${u.hostname}${port}${u.pathname}${q}`;
  } catch {
    return cs;
  }
}

/**
 * Удалённый Postgres (Supabase и т.д.): TLS без строгой проверки цепочки (типично для pooler).
 * Локальный Postgres без ssl в URL — без объекта ssl.
 */
function poolOptions() {
  if (!connectionString) return { connectionString };
  const host = postgresHostname(connectionString);
  const local = host === "localhost" || host === "127.0.0.1";
  const urlWantsSsl =
    /sslmode=require|sslmode=verify-full|sslmode=verify-ca/i.test(connectionString) ||
    /[?&]ssl=true/i.test(connectionString);
  if (local && !urlWantsSsl) {
    return { connectionString };
  }
  const cs = stripSslParamsFromConnectionString(connectionString);
  return {
    connectionString: cs,
    ssl: { rejectUnauthorized: false },
  };
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
