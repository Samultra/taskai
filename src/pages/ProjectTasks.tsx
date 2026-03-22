import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  apiProjectDetail,
  apiProjectCreateTask,
  apiProjectUpdateTask,
  apiProjectDeleteTask,
  apiUpdateTask,
  apiDeleteTask,
} from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";
import { KANBAN_COLUMNS, normalizeKanbanStatus, type KanbanColumnId } from "@/lib/kanban";
import { Calendar, Plus, ArrowLeft, Pencil } from "lucide-react";

function formatAssigneeOption(u: { email: string; full_name?: string | null }) {
  const name = u.full_name?.trim();
  return name ? `${u.email} — ${name}` : u.email;
}

interface ProjectRow {
  id: number;
  name: string;
  code: string | null;
  color: string | null;
  description?: string | null;
  owner_profile_id?: string | null;
  is_archived?: boolean;
}

interface ProjectTask {
  id: number;
  /** null — командная задача с главной (без project_id), показана по отделам проекта */
  project_id: number | null;
  title: string;
  description: string | null;
  documentation: string | null;
  task_type: string | null;
  complexity: string | null;
  status: KanbanColumnId;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  assignee_profile_id: string | null;
  assignee_email?: string | null;
}

const ProjectTasks = () => {
  const { projectId } = useParams();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string; full_name?: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [canAccess, setCanAccess] = useState<boolean | null>(null);
  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    task_type: "feature",
    complexity: "M",
    priority: "medium" as "low" | "medium" | "high",
    status: "backlog" as KanbanColumnId,
    due_date: "",
    assignee_profile_id: "none",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    documentation: "",
    task_type: "feature",
    complexity: "M",
    priority: "medium" as "low" | "medium" | "high",
    status: "backlog" as KanbanColumnId,
    due_date: "",
    assignee_profile_id: "none",
  });

  const numericProjectId = useMemo(
    () => (projectId ? Number.parseInt(projectId, 10) : NaN),
    [projectId],
  );

  const canMutate = Boolean(project && !project.is_archived && canAccess);
  const isAdmin = profile?.role === "admin";
  /** Админ: правка/удаление любых задач, в т.ч. чужих и в архивном проекте; полный список для «Назначен». */
  const canAdminManageProject = Boolean(isAdmin && canAccess && project);
  const canEditTasks = canMutate || canAdminManageProject;

  useEffect(() => {
    if (!projectId || Number.isNaN(numericProjectId)) return;
    const load = async () => {
      setLoading(true);
      setCanAccess(null);
      try {
        const detail = await apiProjectDetail(numericProjectId);
        const proj = detail.project;

        if (!proj) {
          toast({
            title: "Проект не найден",
            description: "Вернитесь к списку проектов",
            variant: "destructive",
          });
          setCanAccess(false);
          return;
        }

        setProject({
          id: proj.id,
          name: proj.name,
          code: proj.code,
          color: proj.color,
          description: proj.description ?? null,
          owner_profile_id: proj.owner_profile_id ?? null,
          is_archived: Boolean(proj.is_archived),
        });

        const memberRows = detail.members ?? [];
        if (Array.isArray(detail.assigneeProfiles)) {
          setUsers(
            detail.assigneeProfiles.map((p) => ({
              id: String(p.id),
              email: String(p.email),
              full_name: p.full_name ?? null,
            })),
          );
        } else {
          setUsers(
            memberRows.map((m: { id: string; email: string; full_name?: string | null }) => ({
              id: m.id,
              email: m.email,
              full_name: m.full_name ?? null,
            })),
          );
        }

        setCanAccess(true);

        const mapped: ProjectTask[] = (detail.tasks ?? []).map((t: any) => ({
          id: Number(t.id),
          project_id: t.project_id != null && t.project_id !== "" ? Number(t.project_id) : null,
          title: t.title,
          description: t.description,
          documentation: t.documentation ?? null,
          task_type: t.task_type,
          complexity: t.complexity,
          status: normalizeKanbanStatus(t.status),
          priority: (t.priority ?? "medium") as "low" | "medium" | "high",
          due_date: t.due_date,
          assignee_profile_id: t.assignee_profile_id,
          assignee_email: t.assignee_email ?? null,
        }));
        setTasks(mapped);
      } catch (e: any) {
        const msg = e?.message ?? "";
        const forbidden = msg.includes("403") || msg.toLowerCase().includes("access") || msg.includes("No access");
        toast({
          title: forbidden ? "Нет доступа" : "Ошибка загрузки проекта",
          description: forbidden
            ? "Вы не участник этого проекта."
            : msg || "Не удалось загрузить проект.",
          variant: "destructive",
        });
        setCanAccess(false);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [numericProjectId, projectId, toast]);

  const openEdit = (t: ProjectTask) => {
    setEditing(t);
    setEditDraft({
      title: t.title,
      description: t.description ?? "",
      documentation: t.documentation ?? "",
      task_type: t.task_type ?? "feature",
      complexity: t.complexity ?? "M",
      priority: t.priority,
      status: t.status,
      due_date: t.due_date ? t.due_date.slice(0, 10) : "",
      assignee_profile_id: t.assignee_profile_id ?? "none",
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      const isProjectScoped = editing.project_id != null;
      const useProjectApi = isProjectScoped || isAdmin;
      const data = useProjectApi
        ? await apiProjectUpdateTask(editing.id, {
            title: editDraft.title.trim(),
            description: editDraft.description.trim() || null,
            documentation: editDraft.documentation.trim() || null,
            task_type: editDraft.task_type,
            complexity: editDraft.complexity,
            status: editDraft.status,
            priority: editDraft.priority,
            due_date: editDraft.due_date ? new Date(editDraft.due_date).toISOString() : null,
            assignee_profile_id: editDraft.assignee_profile_id === "none" ? null : editDraft.assignee_profile_id,
          })
        : await apiUpdateTask(String(editing.id), {
            title: editDraft.title.trim(),
            description: editDraft.description.trim() || null,
            documentation: editDraft.documentation.trim() || null,
            task_type: editDraft.task_type,
            complexity: editDraft.complexity,
            status: editDraft.status,
            priority: editDraft.priority,
            due_date: editDraft.due_date ? new Date(editDraft.due_date).toISOString() : null,
            assignee_profile_id: editDraft.assignee_profile_id === "none" ? null : editDraft.assignee_profile_id,
          });
      const merged: ProjectTask = {
        id: Number(data.id),
        project_id: isProjectScoped ? editing.project_id : null,
        title: data.title,
        description: data.description,
        documentation: data.documentation ?? null,
        task_type: data.task_type,
        complexity: data.complexity,
        status: normalizeKanbanStatus(data.status),
        priority: (data.priority ?? "medium") as "low" | "medium" | "high",
        due_date: data.due_date,
        assignee_profile_id: data.assignee_profile_id,
        assignee_email: (data as any).assignee_email ?? editing.assignee_email ?? null,
      };
      setTasks((prev) => prev.map((x) => (x.id === editing.id ? merged : x)));
      setEditOpen(false);
      setEditing(null);
      toast({ title: "Задача обновлена" });
    } catch (error: any) {
      toast({
        title: "Ошибка сохранения",
        description: error?.message ?? "Не удалось сохранить",
        variant: "destructive",
      });
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim() || Number.isNaN(numericProjectId) || !canMutate) return;

    try {
      const payload: any = {
        title: newTask.title.trim(),
        description: newTask.description.trim() || null,
        task_type: newTask.task_type,
        complexity: newTask.complexity,
        status: newTask.status,
        priority: newTask.priority,
        due_date: newTask.due_date ? new Date(newTask.due_date).toISOString() : null,
        assignee_profile_id: newTask.assignee_profile_id === "none" ? null : newTask.assignee_profile_id,
      };

      const data = await apiProjectCreateTask(numericProjectId, payload);

      const created: ProjectTask = {
        id: Number(data.id),
        project_id: numericProjectId,
        title: data.title,
        description: data.description,
        documentation: data.documentation ?? null,
        task_type: data.task_type,
        complexity: data.complexity,
        status: normalizeKanbanStatus(data.status),
        priority: (data.priority ?? "medium") as "low" | "medium" | "high",
        due_date: data.due_date,
        assignee_profile_id: data.assignee_profile_id,
        assignee_email: data.assignee_email ?? null,
      };

      setTasks((prev) => [...prev, created]);
      setNewTask({
        title: "",
        description: "",
        task_type: "feature",
        complexity: "M",
        priority: "medium",
        status: "backlog",
        due_date: "",
        assignee_profile_id: "none",
      });

      toast({ title: "Задача создана" });
    } catch (error: any) {
      toast({ title: "Не удалось создать задачу", description: error?.message ?? "Ошибка сервера", variant: "destructive" });
    }
  };

  const updateTask = async (id: number, updates: Partial<ProjectTask>) => {
    if (!canEditTasks) return;
    const row = tasks.find((t) => t.id === id);
    if (!row) return;

    const payload: any = {};
    if (updates.status) {
      payload.status = updates.status;
    }
    if (updates.assignee_profile_id !== undefined) {
      payload.assignee_profile_id = updates.assignee_profile_id || null;
    }
    if (updates.due_date !== undefined) {
      payload.due_date = updates.due_date ? new Date(updates.due_date).toISOString() : null;
    }
    if (updates.documentation !== undefined) {
      payload.documentation = updates.documentation;
    }

    if (Object.keys(payload).length === 0) return;

    try {
      const useProjectApi = row.project_id != null || isAdmin;
      const data = useProjectApi ? await apiProjectUpdateTask(id, payload) : await apiUpdateTask(String(id), payload);
      const merged: ProjectTask = {
        id: Number(data.id),
        project_id: row.project_id != null ? row.project_id : null,
        title: data.title,
        description: data.description,
        documentation: data.documentation ?? null,
        task_type: data.task_type,
        complexity: data.complexity,
        status: normalizeKanbanStatus(data.status),
        priority: (data.priority ?? "medium") as "low" | "medium" | "high",
        due_date: data.due_date,
        assignee_profile_id: data.assignee_profile_id,
        assignee_email: (data as any).assignee_email ?? row.assignee_email ?? null,
      };
      setTasks((prev) => prev.map((t) => (t.id === id ? merged : t)));
    } catch (error: any) {
      toast({ title: "Ошибка обновления задачи", description: error?.message ?? "Не удалось обновить задачу", variant: "destructive" });
    }
  };

  const kanbanItems = useMemo(
    () =>
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        documentation: t.documentation,
        status: t.status,
        priority: t.priority,
        assigneeLabel: t.assignee_email,
        readOnly: !canEditTasks,
      })),
    [tasks, canEditTasks],
  );

  const saveTaskDocumentation = async (taskId: string | number, documentation: string | null) => {
    await updateTask(Number(taskId), { documentation });
  };

  const deleteTask = async (id: number) => {
    if (!canEditTasks) return;
    const row = tasks.find((t) => t.id === id);
    if (!row) return;
    try {
      if (isAdmin) {
        await apiProjectDeleteTask(id);
      } else if (row.project_id != null) {
        await apiProjectDeleteTask(id);
      } else {
        await apiDeleteTask(String(id));
      }
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast({ title: "Задача удалена" });
    } catch (error: any) {
      toast({ title: "Ошибка удаления задачи", description: error?.message ?? "Не удалось удалить задачу", variant: "destructive" });
    }
  };

  if (!projectId || Number.isNaN(numericProjectId)) {
    return (
      <div className="min-h-screen p-4 lg:p-8 flex items-center justify-center">
        <Card className="p-6">
          <p>Неверный идентификатор проекта.</p>
        </Card>
      </div>
    );
  }

  if (loading && !project) {
    return (
      <div className="min-h-screen p-4 lg:p-8 flex items-center justify-center">
        <Card className="p-6">
          <p>Загрузка проекта…</p>
        </Card>
      </div>
    );
  }

  if (canAccess === false) {
    return (
      <div className="min-h-screen p-4 lg:p-8 flex items-center justify-center">
        <Card className="p-6 space-y-2 max-w-md">
          <p className="font-semibold">Нет доступа к проекту</p>
          <p className="text-sm text-muted-foreground">
            Вы не являетесь участником проекта или проект не найден. Попросите администратора добавить вас в участники.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/projects">К списку проектов</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-[min(100%,1820px)] mx-auto space-y-6">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <Button asChild variant="outline" size="sm">
                <Link to="/projects">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Все проекты
                </Link>
              </Button>
              {profile?.role === "admin" && (
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                  <Link to="/admin">Админ-панель</Link>
                </Button>
              )}
            </div>
          </div>

          {project.is_archived && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100">
              {isAdmin
                ? "Проект в архиве: новые задачи недоступны. Как администратор, вы можете редактировать и удалять существующие."
                : "Проект в архиве: создание и изменение задач отключены. Разархивируйте проект в админ-панели."}
            </div>
          )}

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              {project.color && (
                <span className="h-10 w-10 rounded-xl border shrink-0" style={{ backgroundColor: project.color }} />
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-bold flex flex-wrap items-center gap-2">
                  {project.name}
                  {project.code && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted uppercase tracking-wide">
                      {project.code}
                    </span>
                  )}
                </h1>
                {project.description && (
                  <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{project.description}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Вы вошли как {profile?.email}.
                  {isAdmin
                    ? " Список исполнителей — все пользователи системы (почта и имя)."
                    : " Участники и исполнители — из состава проекта."}
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground max-w-3xl">
            Канбан-доска: перетаскивайте карточки между колонками. Документация к задаче — кнопка «Доки». Редактирование полей и удаление — в блоке действий на карточке или через «Редактировать».
          </p>
        </header>

        {canMutate && (
          <Card className="p-4 glass-effect shadow-card">
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Новая задача
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Input
                    placeholder="Название задачи"
                    value={newTask.title}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                    required
                  />
                  <Textarea
                    placeholder="Описание задачи..."
                    value={newTask.description}
                    onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={newTask.task_type}
                      onValueChange={(val) => setNewTask((prev) => ({ ...prev, task_type: val }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Тип" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="feature">Фича</SelectItem>
                        <SelectItem value="bug">Баг</SelectItem>
                        <SelectItem value="research">Исследование</SelectItem>
                        <SelectItem value="task">Задача</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={newTask.complexity}
                      onValueChange={(val) => setNewTask((prev) => ({ ...prev, complexity: val }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Сложность" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="S">S</SelectItem>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="XL">XL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={newTask.priority}
                      onValueChange={(val: "low" | "medium" | "high") => setNewTask((prev) => ({ ...prev, priority: val }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Приоритет" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">Critical / High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={newTask.status}
                      onValueChange={(val: KanbanColumnId) => setNewTask((prev) => ({ ...prev, status: val }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Колонка" />
                      </SelectTrigger>
                      <SelectContent>
                        {KANBAN_COLUMNS.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={newTask.due_date}
                        onChange={(e) => setNewTask((prev) => ({ ...prev, due_date: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <Select
                      value={newTask.assignee_profile_id}
                      onValueChange={(val) => setNewTask((prev) => ({ ...prev, assignee_profile_id: val }))}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Исполнитель" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не назначен</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {formatAssigneeOption(u)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!newTask.title.trim()}>
                  Создать задачу
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card className="p-4 glass-effect shadow-card border border-border/80">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="font-semibold text-lg">Задачи проекта</h2>
            <span className="text-xs text-muted-foreground">Всего: {tasks.length}</span>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">В этом проекте пока нет задач. Создайте первую выше.</p>
          ) : (
            <KanbanBoard
              wide
              tasks={kanbanItems}
              onStatusChange={async (taskId, status) => {
                await updateTask(Number(taskId), { status });
              }}
              onSaveDocumentation={canEditTasks ? saveTaskDocumentation : undefined}
              documentationReadOnly={!canEditTasks}
              taskActions={
                canEditTasks
                  ? (item) => (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2"
                          type="button"
                          onClick={() => {
                            const full = tasks.find((x) => x.id === item.id);
                            if (full) openEdit(full);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/50 h-8 px-2 text-xs"
                          type="button"
                          onClick={() => deleteTask(Number(item.id))}
                        >
                          Удалить
                        </Button>
                      </>
                    )
                  : undefined
              }
            />
          )}
        </Card>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Редактировать задачу</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Input
                value={editDraft.title}
                onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Название"
              />
              <Textarea
                value={editDraft.description}
                onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Описание"
                rows={4}
              />
              <Textarea
                value={editDraft.documentation}
                onChange={(e) => setEditDraft((d) => ({ ...d, documentation: e.target.value }))}
                placeholder="Документация (ТЗ, ссылки, заметки)"
                rows={5}
              />
              <div className="grid grid-cols-2 gap-2">
                <Select value={editDraft.task_type} onValueChange={(v) => setEditDraft((d) => ({ ...d, task_type: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feature">Фича</SelectItem>
                    <SelectItem value="bug">Баг</SelectItem>
                    <SelectItem value="research">Исследование</SelectItem>
                    <SelectItem value="task">Задача</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={editDraft.complexity} onValueChange={(v) => setEditDraft((d) => ({ ...d, complexity: v }))}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="S">S</SelectItem>
                    <SelectItem value="M">M</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="XL">XL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={editDraft.priority}
                  onValueChange={(v: "low" | "medium" | "high") => setEditDraft((d) => ({ ...d, priority: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={editDraft.status}
                  onValueChange={(v: KanbanColumnId) => setEditDraft((d) => ({ ...d, status: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KANBAN_COLUMNS.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  className="h-9"
                  value={editDraft.due_date}
                  onChange={(e) => setEditDraft((d) => ({ ...d, due_date: e.target.value }))}
                />
                <Select
                  value={editDraft.assignee_profile_id}
                  onValueChange={(v) => setEditDraft((d) => ({ ...d, assignee_profile_id: v }))}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не назначен</SelectItem>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {formatAssigneeOption(u)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={saveEdit} disabled={!editDraft.title.trim()}>
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default ProjectTasks;
