# Инструкция по добавлению полей в Supabase

## Шаг 1: Откройте Supabase Dashboard
1. Перейдите на https://supabase.com/dashboard
2. Выберите ваш проект

## Шаг 2: Откройте SQL Editor
1. В левом меню нажмите "SQL Editor"
2. Нажмите "New query"

## Шаг 3: Выполните SQL команды
Скопируйте и выполните следующие команды:

```sql
-- Добавить поля subtasks и plan в таблицу tasks
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS subtasks text,
ADD COLUMN IF NOT EXISTS plan text;

-- Комментарии для полей
COMMENT ON COLUMN public.tasks.subtasks IS 'JSON-строка с подзадачами, созданными ИИ';
COMMENT ON COLUMN public.tasks.plan IS 'JSON-строка с планом дня, созданным ИИ';
```

## Шаг 4: Проверьте результат
1. Перейдите в "Table Editor"
2. Выберите таблицу "tasks"
3. Убедитесь, что появились колонки "subtasks" и "plan"

## Шаг 5: Обновите код (после добавления полей)
После выполнения SQL, замените в файле `src/pages/Index.tsx` строку 24:

```typescript
// БЫЛО:
.select("id, title, description, completed, priority, category, due_date, created_at")

// СТАЛО:
.select("id, title, description, completed, priority, category, due_date, created_at, subtasks, plan")
```

И строки 42-43:

```typescript
// БЫЛО:
subtasks: undefined,
plan: undefined

// СТАЛО:
subtasks: t.subtasks ?? undefined,
plan: t.plan ?? undefined
```

## После этого:
- Кнопки "Подзадачи" и "План" будут сохранять результаты в БД
- Кнопка "Просмотр" будет показывать сохранённые данные
- Все функции ИИ будут работать корректно
