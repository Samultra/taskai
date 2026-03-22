-- ШАГ 2 из 2 — выполнить ТОЛЬКО после успешного step1 (новым запросом / новым F5).
-- Переносит старые статусы в канбан.

UPDATE tasks SET status = 'backlog'::task_status WHERE status::text IN ('todo', 'blocked');
UPDATE tasks SET status = 'ready_for_dev'::task_status WHERE status::text = 'in_progress';
UPDATE tasks SET status = 'release_ready'::task_status WHERE status::text = 'done';

UPDATE tasks SET completed = true WHERE status::text = 'release_ready';
