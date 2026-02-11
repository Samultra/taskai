import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Calendar, Plus, ArrowLeft } from "lucide-react";

type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

interface ProjectRow {
  id: number;
  name: string;
  code: string | null;
  color: string | null;
  owner_profile_id?: string | null;
}

interface ProjectTask {
  id: number;
  title: string;
  description: string | null;
  task_type: string | null;
  complexity: string | null;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  assignee_profile_id: string | null;
  assignee_email?: string | null;
}

const statusLabels: Record<TaskStatus, string> = {
  todo: "Запланирована",
  in_progress: "В работе",
  done: "Готово",
  blocked: "Заблокирована",
};

const ProjectTasks = () => {
  const { projectId } = useParams();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "all">("all");
  const [canAccess, setCanAccess] = useState<boolean | null>(null);

  const [newTask, setNewTask] = useState({
    title: "",
    description: "",
    task_type: "feature",
    complexity: "M",
    priority: "medium" as "low" | "medium" | "high",
    status: "todo" as TaskStatus,
    due_date: "",
    assignee_profile_id: "",
  });

  const numericProjectId = useMemo(
    () => (projectId ? Number.parseInt(projectId, 10) : NaN),
    [projectId]
  );

  useEffect(() => {
    if (!projectId || Number.isNaN(numericProjectId)) return;
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: proj, error: projErr }, { data: usersRows, error: usersErr }] =
          await Promise.all([
            supabase
              .from("projects")
              .select("id, name, code, color, owner_profile_id")
              .eq("id", numericProjectId)
              .maybeSingle(),
            supabase.from("profiles").select("id, email").order("email", { ascending: true }),
          ]);

        if (projErr || !proj) {
          console.error(projErr);
          toast({
            title: "Проект не найден",
            description: "Вернитесь в список проектов",
            variant: "destructive",
          });
          return;
        }

        setProject({
          id: proj.id,
          name: proj.name,
          code: proj.code,
          color: proj.color,
          owner_profile_id: (proj as any).owner_profile_id ?? null,
        });

        if (usersErr) {
          console.error(usersErr);
        } else {
          setUsers((usersRows ?? []) as { id: string; email: string }[]);
        }

        // Проверка доступа к проекту
        const isAdmin = profile?.role === "admin";
        const isModerator = profile?.role === "moderator";
        const isOwner = !!profile?.id && (proj as any).owner_profile_id === profile.id;

        let allowed = false;
        if (isAdmin) allowed = true;
        else if ((isModerator || profile?.role === "user") && profile?.id) {
          const { data: membership, error: memErr } = await supabase
            .from("project_members")
            .select("project_id")
            .eq("project_id", numericProjectId)
            .eq("profile_id", profile.id)
            .maybeSingle();
          if (memErr) console.error(memErr);
          allowed = Boolean(membership) || isOwner;
        }
        setCanAccess(allowed);

        if (!allowed) {
          setTasks([]);
          return;
        }

        // Загрузка задач проекта (после проверки доступа)
        const { data: taskRows, error: taskErr } = await supabase
          .from("tasks")
          .select(
            "id, title, description, task_type, complexity, status, priority, due_date, assignee_profile_id, profiles!tasks_assignee_profile_id_fkey(email)"
          )
          .eq("project_id", numericProjectId)
          .order("due_date", { ascending: true });

        if (taskErr) {
          console.error(taskErr);
          toast({ title: "Ошибка загрузки задач проекта", description: taskErr.message, variant: "destructive" });
        } else {
          const mapped: ProjectTask[] = (taskRows ?? []).map((t: any) => ({
            id: t.id,
            title: t.title,
            description: t.description,
            task_type: t.task_type,
            complexity: t.complexity,
            status: (t.status as TaskStatus) ?? "todo",
            priority: (t.priority ?? "medium") as "low" | "medium" | "high",
            due_date: t.due_date,
            assignee_profile_id: t.assignee_profile_id,
            assignee_email: t.profiles?.email ?? null,
          }));
          setTasks(mapped);
        }
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [numericProjectId, projectId, toast, profile?.id, profile?.role]);

  const filteredTasks = useMemo(() => {
    if (filterStatus === "all") return tasks;
    return tasks.filter((t) => t.status === filterStatus);
  }, [tasks, filterStatus]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim() || Number.isNaN(numericProjectId)) return;

    const payload: any = {
      project_id: numericProjectId,
      title: newTask.title.trim(),
      description: newTask.description.trim() || null,
      task_type: newTask.task_type,
      complexity: newTask.complexity,
      status: newTask.status,
      priority: newTask.priority,
      due_date: newTask.due_date ? new Date(newTask.due_date).toISOString() : null,
      assignee_profile_id: newTask.assignee_profile_id || null,
      completed: newTask.status === "done",
      category: "Проект",
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select(
        "id, title, description, task_type, complexity, status, priority, due_date, assignee_profile_id, profiles!tasks_assignee_profile_id_fkey(email)"
      )
      .single();

    if (error) {
      toast({ title: "Не удалось создать задачу", description: error.message, variant: "destructive" });
      return;
    }

    const created: ProjectTask = {
      id: data.id,
      title: data.title,
      description: data.description,
      task_type: data.task_type,
      complexity: data.complexity,
      status: (data.status as TaskStatus) ?? "todo",
      priority: (data.priority ?? "medium") as "low" | "medium" | "high",
      due_date: data.due_date,
      assignee_profile_id: data.assignee_profile_id,
      assignee_email: data.profiles?.email ?? null,
    };

    setTasks((prev) => [...prev, created]);
    setNewTask({
      title: "",
      description: "",
      task_type: "feature",
      complexity: "M",
      priority: "medium",
      status: "todo",
      due_date: "",
      assignee_profile_id: "",
    });

    toast({ title: "Задача создана" });
  };

  const updateTask = async (id: number, updates: Partial<ProjectTask>) => {
    const payload: any = {};
    if (updates.status) {
      payload.status = updates.status;
      payload.completed = updates.status === "done";
    }
    if (updates.assignee_profile_id !== undefined) {
      payload.assignee_profile_id = updates.assignee_profile_id || null;
    }
    if (updates.due_date !== undefined) {
      payload.due_date = updates.due_date ? new Date(updates.due_date).toISOString() : null;
    }

    if (Object.keys(payload).length === 0) return;

    const { error } = await supabase.from("tasks").update(payload).eq("id", id);
    if (error) {
      toast({ title: "Ошибка обновления задачи", description: error.message, variant: "destructive" });
      return;
    }

    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              ...updates,
            }
          : t
      )
    );
  };

  const deleteTask = async (id: number) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      toast({ title: "Ошибка удаления задачи", description: error.message, variant: "destructive" });
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast({ title: "Задача удалена" });
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

  if (!project) {
    return (
      <div className="min-h-screen p-4 lg:p-8 flex items-center justify-center">
        <Card className="p-6">
          <p>{loading ? "Загрузка проекта..." : "Проект не найден."}</p>
        </Card>
      </div>
    );
  }

  // простая проверка прав: админ/модератор видят всё, остальные — только проекты, куда их добавили (позже можно усилить)
  const isPrivileged = profile?.role === "admin" || profile?.role === "moderator";

  if (canAccess === false) {
    return (
      <div className="min-h-screen p-4 lg:p-8 flex items-center justify-center">
        <Card className="p-6 space-y-2">
          <p className="font-semibold">Нет доступа к проекту</p>
          <p className="text-sm text-muted-foreground">
            Вы не являетесь участником проекта. Попросите администратора или владельца добавить вас.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">На главную</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link to="/admin">
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  К проектам
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  {project.name}
                  {project.code && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted uppercase tracking-wide">
                      {project.code}
                    </span>
                  )}
                </h1>
                <p className="text-xs text-muted-foreground">
                  Планирование и управление задачами проекта. Вы вошли как {profile?.email}.
                </p>
              </div>
            </div>
            {project.color && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Цвет проекта</span>
                <span
                  className="h-5 w-5 rounded-full border"
                  style={{ backgroundColor: project.color }}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Фильтр по статусу:</span>
              <Select
                value={filterStatus}
                onValueChange={(val) => setFilterStatus(val as TaskStatus | "all")}
              >
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все</SelectItem>
                  <SelectItem value="todo">Запланированы</SelectItem>
                  <SelectItem value="in_progress">В работе</SelectItem>
                  <SelectItem value="done">Готово</SelectItem>
                  <SelectItem value="blocked">Заблокированы</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        {/* Создание задачи */}
        {isPrivileged && (
          <Card className="p-4 glass-effect shadow-card">
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Новая задача проекта
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
                      onValueChange={(val: "low" | "medium" | "high") =>
                        setNewTask((prev) => ({ ...prev, priority: val }))
                      }
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
                      onValueChange={(val: TaskStatus) =>
                        setNewTask((prev) => ({ ...prev, status: val }))
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Статус" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">Запланирована</SelectItem>
                        <SelectItem value="in_progress">В работе</SelectItem>
                        <SelectItem value="done">Готово</SelectItem>
                        <SelectItem value="blocked">Заблокирована</SelectItem>
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
                      onValueChange={(val) =>
                        setNewTask((prev) => ({ ...prev, assignee_profile_id: val }))
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Исполнитель (опционально)" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.email}
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

        {/* Таблица задач */}
        <Card className="p-4 glass-effect shadow-card border border-border/80">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Задача</TableHead>
                <TableHead>Тип / Сложность</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Приоритет</TableHead>
                <TableHead>Дедлайн</TableHead>
                <TableHead>Исполнитель</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="font-medium">{t.title}</p>
                      {t.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="uppercase tracking-wide">
                        {t.task_type ?? "—"}
                      </span>
                      <span className="text-muted-foreground">Сложность: {t.complexity ?? "—"}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.status}
                      onValueChange={(val: TaskStatus) => updateTask(t.id, { status: val })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        t.priority === "high"
                          ? "border-destructive text-destructive"
                          : t.priority === "medium"
                          ? "border-warning text-warning"
                          : "border-success text-success"
                      }
                    >
                      {t.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={t.due_date ? t.due_date.slice(0, 10) : ""}
                      onChange={(e) => updateTask(t.id, { due_date: e.target.value || null })}
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={t.assignee_profile_id ?? "none"}
                      onValueChange={(val) =>
                        updateTask(t.id, { assignee_profile_id: val === "none" ? null : val })
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue
                          placeholder={t.assignee_email ? t.assignee_email : "Не назначен"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Не назначен</SelectItem>
                        {users.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive border-destructive/50 h-8 px-2 text-xs"
                      onClick={() => deleteTask(t.id)}
                    >
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableCaption>
              {filteredTasks.length === 0
                ? "В этом проекте пока нет задач."
                : `Всего задач: ${filteredTasks.length}`}
            </TableCaption>
          </Table>
        </Card>
      </div>
    </div>
  );
};

export default ProjectTasks;

