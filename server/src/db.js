import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn("DATABASE_URL is not set. Backend will not be able to connect to PostgreSQL.");
}

/** Supabase / managed Postgres over SSL: Node may reject the chain ("self-signed certificate"). */
function poolOptions() {
  const base = { connectionString };
  if (!connectionString) return base;
  const needsSsl =
    /sslmode=require|sslmode=verify-full|sslmode=verify-ca/i.test(connectionString) ||
    /[?&]ssl=true/i.test(connectionString);
  if (!needsSsl) return base;
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
