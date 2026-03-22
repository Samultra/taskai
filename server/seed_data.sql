-- 1) Обновляем роли уже зарегистрированных пользователей
UPDATE profiles SET role = 'admin'     WHERE email = 'admin@test.local';
UPDATE profiles SET role = 'moderator' WHERE email = 'moder@test.local';
UPDATE profiles SET role = 'user'      WHERE email = 'user@user.local';

-- 2) Добавляем ещё два профиля (просто для данных, логиниться ими не нужно)
INSERT INTO profiles (email, full_name, role, is_blocked, password_hash)
VALUES
  ('report@demo.local', 'Report Bot', 'user', false, 'no-login'),
  ('guest@demo.local',  'Guest Demo', 'user', false, 'no-login')
ON CONFLICT (email) DO NOTHING;

-- 3) Отделы (минимум 5)
INSERT INTO departments (name, description)
VALUES
  ('Разработка', 'Все задачи разработки'),
  ('Маркетинг',  'Маркетинг и контент'),
  ('Продажи',    'Отдел продаж и CRM'),
  ('HR',         'Подбор и адаптация'),
  ('Поддержка',  'Поддержка клиентов')
ON CONFLICT DO NOTHING;

WITH ids AS (
  SELECT
    (SELECT id FROM profiles WHERE email = 'admin@test.local' LIMIT 1) AS admin_id,
    (SELECT id FROM profiles WHERE email = 'moder@test.local' LIMIT 1) AS moder_id,
    (SELECT id FROM profiles WHERE email = 'user@user.local'  LIMIT 1) AS user_id
)
INSERT INTO projects (name, code, description, color, owner_profile_id)
SELECT *
FROM (
  SELECT
    'TaskAI Core'::text      AS name,
    'CORE'::text             AS code,
    'Основной продукт: задачи, роли, проекты'::text AS description,
    '#4f46e5'::text          AS color,
    (SELECT moder_id FROM ids) AS owner_profile_id
  UNION ALL
  SELECT
    'Marketing Site'::text,
    'MKT'::text,
    'Лендинг, контент, аналитика'::text,
    '#16a34a'::text,
    (SELECT admin_id FROM ids)
  UNION ALL
  SELECT
    'CRM System'::text,
    'CRM'::text,
    'Воронка продаж и клиенты'::text,
    '#0ea5e9'::text,
    (SELECT admin_id FROM ids)
  UNION ALL
  SELECT
    'HR Portal'::text,
    'HRM'::text,
    'Онбординг и кадровые процессы'::text,
    '#f97316'::text,
    (SELECT moder_id FROM ids)
  UNION ALL
  SELECT
    'Support Center'::text,
    'SUP'::text,
    'Тикеты от клиентов и SLA'::text,
    '#22c55e'::text,
    (SELECT user_id FROM ids)
) s
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.code = s.code);

-- 4) Проект ↔ отдел: участники отдела видят проект в списке (без отдельного project_members)
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
ON CONFLICT DO NOTHING;