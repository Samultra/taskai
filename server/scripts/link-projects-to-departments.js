/**
 * Связывает проекты с отделами по code/name, чтобы участники отдела видели проект в /projects.
 * Запуск: из папки server: node scripts/link-projects-to-departments.js
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const sql = `
    INSERT INTO project_departments (project_id, department_id)
    SELECT p.id, d.id
    FROM projects p
    INNER JOIN departments d ON (
      (p.code = 'CORE' AND d.name = 'Разработка') OR
      (p.code = 'MKT' AND d.name = 'Маркетинг') OR
      (p.code = 'CRM' AND d.name = 'Продажи') OR
      (p.code = 'HRM' AND d.name = 'HR') OR
      (p.code = 'SUP' AND d.name = 'Поддержка')
    )
    ON CONFLICT DO NOTHING
  `;
  const r = await pool.query(sql);
  console.log("project_departments: inserted/ignored rows processed");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
