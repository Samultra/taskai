-- ШАГ 1 из 2 — выполнить в pgAdmin ОДИН раз (F5), затем открыть step2 и выполнить отдельно.
-- Добавляет значения enum и колонку. Новые значения нельзя использовать до завершения этой транзакции.

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'backlog';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'analytics';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'ready_for_dev';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'release_ready';

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS documentation TEXT;
