-- Моковые данные для TaskAI (проекты/отделы/участники/задачи)
-- Запуск: Supabase Dashboard -> SQL Editor -> вставить и Run
--
-- Требуется, чтобы в public.profiles уже существовали:
-- - admin@test.local
-- - moder@test.local
-- - user@user.local
--
-- Также должна быть применена миграция, которая добавляет таблицы:
-- departments, projects, project_members, project_departments
-- и расширенные поля в tasks (project_id, task_type, complexity, status, assignee_profile_id)

-- 1) Отделы
insert into public.departments (name, description)
values
  ('Разработка', 'Все задачи разработки'),
  ('Маркетинг', 'Маркетинг и контент')
on conflict do nothing;

-- 2) Проекты
with ids as (
  select
    (select id from public.profiles where email = 'admin@test.local' limit 1) as admin_id,
    (select id from public.profiles where email = 'moder@test.local' limit 1) as moder_id,
    (select id from public.profiles where email = 'user@user.local' limit 1) as user_id
)
insert into public.projects (name, code, description, color, owner_profile_id)
select *
from (
  select
    'TaskAI Core'::text as name,
    'CORE'::text as code,
    'Основной продукт: задачи, роли, проекты'::text as description,
    '#4f46e5'::text as color,
    (select moder_id from ids) as owner_profile_id
  union all
  select
    'Marketing Site'::text,
    'MKT'::text,
    'Лендинг, контент, аналитика'::text,
    '#16a34a'::text,
    (select admin_id from ids)
) s
where not exists (select 1 from public.projects p where p.code = s.code);

-- 3) Привязка проектов к отделам
insert into public.project_departments (project_id, department_id)
select p.id, d.id
from public.projects p
join public.departments d on (
  (p.code = 'CORE' and d.name = 'Разработка') or
  (p.code = 'MKT' and d.name = 'Маркетинг')
)
on conflict do nothing;

-- 4) Участники проектов
with ids as (
  select
    (select id from public.profiles where email = 'admin@test.local' limit 1) as admin_id,
    (select id from public.profiles where email = 'moder@test.local' limit 1) as moder_id,
    (select id from public.profiles where email = 'user@user.local' limit 1) as user_id
)
insert into public.project_members (project_id, profile_id, role)
select p.id, x.profile_id, x.role
from public.projects p
cross join ids
join (
  select 'CORE'::text as code, (select admin_id from ids) as profile_id, 'admin'::text as role
  union all select 'CORE', (select moder_id from ids), 'moderator'
  union all select 'CORE', (select user_id from ids), 'member'
  union all select 'MKT', (select admin_id from ids), 'admin'
  union all select 'MKT', (select user_id from ids), 'member'
) x on x.code = p.code
where x.profile_id is not null
on conflict do nothing;

-- 5) Задачи (внутри проектов)
with proj as (
  select
    (select id from public.projects where code = 'CORE' limit 1) as core_id,
    (select id from public.projects where code = 'MKT' limit 1) as mkt_id
),
ids as (
  select
    (select id from public.profiles where email = 'admin@test.local' limit 1) as admin_id,
    (select id from public.profiles where email = 'moder@test.local' limit 1) as moder_id,
    (select id from public.profiles where email = 'user@user.local' limit 1) as user_id
)
insert into public.tasks (
  title, description, completed, priority, category, due_date, created_at,
  project_id, task_type, complexity, status, assignee_profile_id
)
select * from (
  select
    'Добавить Канбан-доску'::text,
    'Сделать представление задач по статусам (todo/in_progress/done/blocked).'::text,
    false,
    'high'::text,
    'Проект'::text,
    now() + interval '5 days',
    now(),
    (select core_id from proj),
    'feature'::text,
    'L'::text,
    'todo'::text,
    (select moder_id from ids)
  union all
  select
    'Починить стили таблиц в админке'::text,
    'Сделать границы заметнее и таблицы шире.'::text,
    false,
    'medium',
    'Проект',
    now() + interval '2 days',
    now(),
    (select core_id from proj),
    'task',
    'M',
    'in_progress',
    (select admin_id from ids)
  union all
  select
    'Настроить роли и доступы проекта'::text,
    'Проверить, что user видит только свои проекты, а admin/moderator — свои.'::text,
    false,
    'medium',
    'Проект',
    now() + interval '7 days',
    now(),
    (select core_id from proj),
    'research',
    'M',
    'blocked',
    (select moder_id from ids)
  union all
  select
    'Подготовить контент для лендинга'::text,
    'Тексты, блоки, CTA, преимущества.'::text,
    false,
    'low',
    'Проект',
    now() + interval '10 days',
    now(),
    (select mkt_id from proj),
    'task',
    'S',
    'todo',
    (select user_id from ids)
) s
where s.project_id is not null;

