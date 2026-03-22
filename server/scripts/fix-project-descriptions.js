/**
 * Исправляет описания проектов в UTF-8 (если при импорте/psql они сохранились как «кракозябры»).
 * Запуск: из папки server: node scripts/fix-project-descriptions.js
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const FIXES = [
  { code: "CORE", description: "Основной продукт: задачи, роли, проекты" },
  { code: "MKT", description: "Лендинг, контент, аналитика" },
  { code: "CRM", description: "Воронка продаж и клиенты" },
  { code: "HRM", description: "Онбординг и кадровые процессы" },
  { code: "SUP", description: "Тикеты от клиентов и SLA" },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET client_encoding TO 'UTF8'");
    for (const { code, description } of FIXES) {
      const r = await client.query(
        `UPDATE projects SET description = $1 WHERE code = $2`,
        [description, code],
      );
      console.log(`UPDATE ${code}: ${r.rowCount} row(s)`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
