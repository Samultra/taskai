import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth, AppRole, Profile } from "@/hooks/useAuth";
import {
  apiModeratorOverview,
  apiModeratorHandleRequest,
  apiModeratorUpdateUserRole,
  apiModeratorBlockUser,
  apiModeratorUpdateUserName,
  apiModeratorUpdateProjectMeta,
  apiModeratorAddMember,
  apiModeratorRemoveMember,
  apiModeratorUpdateTask,
  apiModeratorHandleDeptJoinRequest,
} from "@/lib/api";

interface RegistrationRequest {
  id: number;
  email: string;
  full_name: string | null;
  role_requested: AppRole;
  status: string;
  created_at: string;
}

interface ActivityLog {
  id: number;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: any | null;
  created_at: string;
}

type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

interface Project {
  id: number;
  name: string;
  code: string | null;
  color: string | null;
  owner_profile_id: string | null;
  is_archived: boolean;
  created_at: string;
}

interface ProjectMember {
  project_id: number;
  profile_id: string;
  role: string;
}

interface ProjectTaskRow {
  id: number;
  project_id: number | null;
  title: string;
  status: TaskStatus;
  priority: "low" | "medium" | "high";
  due_date: string | null;
  assignee_profile_id: string | null;
}

interface DepartmentJoinRequest {
  id: number;
  department_id: number;
  department_name: string;
  email: string;
  full_name: string | null;
  status: string;
  created_at: string;
}

const ModeratorDashboard = () => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [tasks, setTasks] = useState<ProjectTaskRow[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [memberEmailByProject, setMemberEmailByProject] = useState<Record<number, string>>({});
  const [deptRequests, setDeptRequests] = useState<DepartmentJoinRequest[]>([]);

  const loadAll = async () => {
    setLoading(true);
    try {
      if (!profile?.id) return;
      const data = await apiModeratorOverview();
      setRequests((data.requests ?? []) as RegistrationRequest[]);
      setLogs((data.logs ?? []) as ActivityLog[]);
      setProjects((data.projects ?? []) as Project[]);
      setMembers((data.members ?? []) as ProjectMember[]);
      setTasks((data.tasks ?? []) as ProjectTaskRow[]);
      setUsers((data.users ?? []) as Profile[]);
      setDeptRequests((data.departmentJoinRequests ?? []) as DepartmentJoinRequest[]);
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Ошибка загрузки данных",
        description: error?.message ?? "Не удалось загрузить данные модератора",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [profile?.id]);

  const handleRequest = async (id: number, action: "approve" | "reject", requestedRole: AppRole, email: string) => {
    try {
      await apiModeratorHandleRequest(id, action, requestedRole, email);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast({ title: action === "approve" ? "Заявка отмечена как одобренная" : "Заявка отклонена" });
      loadAll();
    } catch (error: any) {
      toast({ title: "Ошибка обновления заявки", description: error?.message ?? "Не удалось обновить заявку", variant: "destructive" });
    }
  };

  const projectsById = useMemo(
    () =>
      projects.reduce<Record<number, Project>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {}),
    [projects]
  );

  const userEmailById = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.email));
    return map;
  }, [users]);

  const membersByProject = useMemo(() => {
    const map = new Map<number, ProjectMember[]>();
    members.forEach((m) => {
      const arr = map.get(m.project_id) ?? [];
      arr.push(m);
      map.set(m.project_id, arr);
    });
    return map;
  }, [members]);

  const isOwner = (project: Project) => project.owner_profile_id === profile?.id;

  const handleUserRoleChange = async (userId: string, role: AppRole) => {
    // модератор не может назначать/снимать admin, только user/moderator
    if (role === "admin") return;
    try {
      await apiModeratorUpdateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast({ title: "Роль обновлена", description: "Роль пользователя успешно изменена." });
    } catch (error: any) {
      toast({ title: "Ошибка смены роли", description: error?.message ?? "Не удалось обновить роль", variant: "destructive" });
    }
  };

  const handleUserBlockToggle = async (user: Profile) => {
    const nextBlocked = !user.is_blocked;
    try {
      await apiModeratorBlockUser(user.id, nextBlocked);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_blocked: nextBlocked } : u)));
      toast({
        title: nextBlocked ? "Пользователь заблокирован" : "Пользователь разблокирован",
        description: user.email,
      });
    } catch (error: any) {
      toast({ title: "Ошибка изменения статуса", description: error?.message ?? "Не удалось изменить статус", variant: "destructive" });
    }
  };

  const handleUserNameChange = async (userId: string, fullName: string) => {
    try {
      await apiModeratorUpdateUserName(userId, fullName);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, full_name: fullName } : u)));
    } catch (error: any) {
      toast({ title: "Ошибка сохранения имени", description: error?.message ?? "Не удалось сохранить имя", variant: "destructive" });
    }
  };

  const handleProjectMetaChange = async (projectId: number, updates: Partial<Pick<Project, "name" | "code" | "color">>) => {
    if (!Object.keys(updates).length) return;
    try {
      await apiModeratorUpdateProjectMeta(projectId, updates);
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...updates } : p)));
      toast({ title: "Проект обновлён" });
    } catch (error: any) {
      toast({ title: "Ошибка обновления проекта", description: error?.message ?? "Не удалось обновить проект", variant: "destructive" });
    }
  };

  const addMember = async (projectId: number) => {
    const email = (memberEmailByProject[projectId] ?? "").trim();
    if (!email) return;
    try {
      const result = await apiModeratorAddMember(projectId, email);
      setMembers((prev) => [...prev, { project_id: result.project_id, profile_id: result.profile_id, role: result.role }]);
      setMemberEmailByProject((prev) => ({ ...prev, [projectId]: "" }));
      toast({ title: "Участник добавлен" });
    } catch (error: any) {
      toast({ title: "Пользователь не найден или ошибка добавления", description: error?.message ?? email, variant: "destructive" });
    }
  };

  const removeMember = async (projectId: number, profileId: string) => {
    try {
      await apiModeratorRemoveMember(projectId, profileId);
      setMembers((prev) => prev.filter((m) => !(m.project_id === projectId && m.profile_id === profileId)));
    } catch (error: any) {
      toast({ title: "Ошибка удаления", description: error?.message ?? "Не удалось удалить участника", variant: "destructive" });
    }
  };

  const updateTask = async (id: number, updates: Partial<ProjectTaskRow>) => {
    const payload: any = {};
    if (updates.status) {
      payload.status = updates.status;
    }
    if (updates.due_date !== undefined) {
      payload.due_date = updates.due_date ? new Date(updates.due_date).toISOString() : null;
    }
    if (updates.assignee_profile_id !== undefined) {
      payload.assignee_profile_id = updates.assignee_profile_id || null;
    }
    if (!Object.keys(payload).length) return;
    try {
      await apiModeratorUpdateTask(id, payload);
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
    } catch (error: any) {
      toast({ title: "Ошибка обновления задачи", description: error?.message ?? "Не удалось обновить задачу", variant: "destructive" });
    }
  };

  const handleDeptJoinRequest = async (id: number, action: "approve" | "reject") => {
    try {
      await apiModeratorHandleDeptJoinRequest(id, action);
      setDeptRequests(prev => prev.filter(r => r.id !== id));
      toast({
        title: action === "approve" ? "Заявка одобрена" : "Заявка отклонена",
      });
    } catch (error: any) {
      toast({
        title: "Ошибка обработки заявки отдела",
        description: error?.message ?? "Не удалось обработать заявку",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Кабинет модератора</h1>
            <p className="text-muted-foreground text-sm">
              Обработка заявок на роли. Вы вошли как {profile?.email}.
            </p>
          </div>
          <Button variant="outline" onClick={loadAll} disabled={loading}>
            Обновить список
          </Button>
        </header>

        <Card className="p-4 space-y-4 glass-effect shadow-card border border-border/80">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Мои проекты</h2>
            <Badge variant="outline">{projects.length}</Badge>
          </div>
          <div className="space-y-3 max-h-[420px] overflow-auto pr-1 text-xs">
            {projects.map((p) => {
              const mems = membersByProject.get(p.id) ?? [];
              return (
                <div key={p.id} className="border-b pb-2 last:border-b-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.color && <span className="h-4 w-4 rounded-full border" style={{ backgroundColor: p.color }} />}
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          {isOwner(p) ? (
                            <Input
                              className="h-7 text-xs"
                              defaultValue={p.name}
                              placeholder="Название проекта"
                              onBlur={(e) => {
                                const value = e.target.value.trim();
                                if (value && value !== p.name) {
                                  handleProjectMetaChange(p.id, { name: value });
                                }
                              }}
                            />
                          ) : (
                            <p className="text-xs font-semibold truncate">
                              {p.name} {p.code ? `(${p.code})` : ""} {p.is_archived ? "• ARCHIVED" : ""}
                            </p>
                          )}
                          {isOwner(p) && (
                            <Input
                              className="h-7 w-20 text-xs"
                              type="color"
                              value={p.color ?? "#4f46e5"}
                              onChange={(e) => handleProjectMetaChange(p.id, { color: e.target.value })}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground truncate">
                          <span>ID: {p.id}</span>
                          {isOwner(p) && (
                            <Input
                              className="h-7 text-[11px] max-w-[140px]"
                              defaultValue={p.code ?? ""}
                              placeholder="Код проекта"
                              onBlur={(e) => {
                                const value = e.target.value.trim();
                                if (value !== (p.code ?? "")) {
                                  handleProjectMetaChange(p.id, { code: value || null });
                                }
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                      <Link to={`/projects/${p.id}`}>Задачи</Link>
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1 items-center">
                    <span className="text-[11px] text-muted-foreground">Участники:</span>
                    {mems.map((m) => (
                      <Badge key={`${m.project_id}-${m.profile_id}`} variant="outline" className="text-[10px] flex items-center gap-1">
                        {userEmailById.get(m.profile_id) ?? m.profile_id.slice(0, 8)}
                        {isOwner(p) && (
                          <button type="button" className="ml-1" onClick={() => removeMember(p.id, m.profile_id)}>
                            ×
                          </button>
                        )}
                      </Badge>
                    ))}
                    {mems.length === 0 && <span className="text-[11px] text-muted-foreground">нет</span>}
                  </div>

                  {isOwner(p) && (
                    <div className="flex gap-2 items-center">
                      <Input
                        className="h-8 text-xs"
                        placeholder="Email для добавления участника"
                        value={memberEmailByProject[p.id] ?? ""}
                        onChange={(e) => setMemberEmailByProject((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addMember(p.id);
                          }
                        }}
                      />
                      <Button size="sm" variant="outline" className="h-8" onClick={() => addMember(p.id)}>
                        Добавить
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
            {projects.length === 0 && <p className="text-sm text-muted-foreground">Проектов пока нет.</p>}
          </div>
        </Card>

        <Card className="p-4 space-y-4 glass-effect shadow-card border border-border/80">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Заявки в отделы</h2>
            <Badge variant="outline">{deptRequests.length}</Badge>
          </div>
          <div className="space-y-3 max-h-[320px] overflow-auto pr-1 text-xs">
            {deptRequests.map((r) => (
              <div key={r.id} className="border-b pb-2 last:border-b-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.email}</p>
                    {r.full_name && (
                      <p className="text-xs text-muted-foreground truncate">Имя: {r.full_name}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground truncate">
                      Отдел: {r.department_name}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Отправлена: {new Date(r.created_at).toLocaleString("ru-RU")}
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeptJoinRequest(r.id, "approve")}
                  >
                    Одобрить
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/50"
                    onClick={() => handleDeptJoinRequest(r.id, "reject")}
                  >
                    Отклонить
                  </Button>
                </div>
              </div>
            ))}
            {deptRequests.length === 0 && (
              <p className="text-sm text-muted-foreground">Нет заявок в отделы.</p>
            )}
          </div>
        </Card>

        <Card className="p-4 space-y-4 glass-effect shadow-card border border-border/80">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Задачи моих проектов</h2>
            <Badge variant="outline">{tasks.length}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Проект</TableHead>
                <TableHead>Задача</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Дедлайн</TableHead>
                <TableHead>Исполнитель</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs">
                    {t.project_id ? (projectsById[t.project_id]?.code || projectsById[t.project_id]?.name || t.project_id) : "—"}
                  </TableCell>
                  <TableCell className="text-xs">{t.title}</TableCell>
                  <TableCell className="text-xs">
                    <Select value={t.status} onValueChange={(val: TaskStatus) => updateTask(t.id, { status: val })}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todo">todo</SelectItem>
                        <SelectItem value="in_progress">in_progress</SelectItem>
                        <SelectItem value="done">done</SelectItem>
                        <SelectItem value="blocked">blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={t.due_date ? t.due_date.slice(0, 10) : ""}
                      onChange={(e) => updateTask(t.id, { due_date: e.target.value || null })}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    <Select
                      value={t.assignee_profile_id ?? "none"}
                      onValueChange={(val) => updateTask(t.id, { assignee_profile_id: val === "none" ? null : val })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Не назначен" />
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
                </TableRow>
              ))}
            </TableBody>
            <TableCaption>
              {tasks.length ? "Быстрое управление задачами проектов (статус/дедлайн/исполнитель)." : "Пока нет задач."}
            </TableCaption>
          </Table>
        </Card>

        <Card className="p-4 space-y-4 glass-effect shadow-card border border-border/80">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Пользователи (для модерации)</h2>
            <Badge variant="outline">{users.length}</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Создан</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="text-xs">
                    <div className="flex flex-col">
                      <span>{u.email}</span>
                      <span className="text-[10px] text-muted-foreground">ID: {u.id.slice(0, 8)}...</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Input
                      className="h-8 text-xs"
                      defaultValue={u.full_name ?? ""}
                      placeholder="Имя пользователя"
                      onBlur={(e) => {
                        if (e.target.value !== (u.full_name ?? "")) {
                          handleUserNameChange(u.id, e.target.value);
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-xs">
                    <Select
                      value={u.role}
                      onValueChange={(value: AppRole) => handleUserRoleChange(u.id, value)}
                    >
                      <SelectTrigger className="w-[120px] h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">user</SelectItem>
                        <SelectItem value="moderator">moderator</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Button
                      size="sm"
                      variant={u.is_blocked ? "default" : "outline"}
                      className="h-8 px-2 text-xs"
                      onClick={() => handleUserBlockToggle(u)}
                    >
                      {u.is_blocked ? "Разблокировать" : "Заблокировать"}
                    </Button>
                  </TableCell>
                  <TableCell className="text-xs">
                    {u.created_at ? new Date(u.created_at).toLocaleString("ru-RU") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableCaption>
              Модератор может менять имя, роль (user/moderator) и блокировать аккаунты. Роль admin доступна только в
              админ-панели.
            </TableCaption>
          </Table>
        </Card>

        <Card className="p-4 space-y-4 glass-effect shadow-card border border-border/80">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Заявки в ожидании</h2>
            <Badge variant="outline">{requests.length}</Badge>
          </div>
          <div className="space-y-3 max-h-[500px] overflow-auto pr-1">
            {requests.map((r) => (
              <div key={r.id} className="border-b pb-2 last:border-b-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.email}</p>
                    {r.full_name && (
                      <p className="text-xs text-muted-foreground truncate">Имя: {r.full_name}</p>
                    )}
                  </div>
                  <Badge>{r.role_requested}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Отправлена: {new Date(r.created_at).toLocaleString("ru-RU")}
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRequest(r.id, "approve", r.role_requested, r.email)}
                  >
                    Одобрить
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/50"
                    onClick={() => handleRequest(r.id, "reject", r.role_requested, r.email)}
                  >
                    Отклонить
                  </Button>
                </div>
              </div>
            ))}
            {requests.length === 0 && (
              <p className="text-sm text-muted-foreground">Нет заявок в ожидании.</p>
            )}
          </div>
        </Card>

        <Card className="p-4 space-y-4 glass-effect shadow-card border border-border/80">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Недавние действия по заявкам</h2>
            <Badge variant="outline">{logs.length}</Badge>
          </div>
          <div className="space-y-2 max-h-[260px] overflow-auto pr-1 text-xs">
            {logs.map((log) => (
              <div key={log.id} className="border-b pb-1 last:border-b-0">
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("ru-RU")}
                  </span>
                  <span className="uppercase text-[10px] tracking-wide">
                    {log.action} • {log.target_type ?? "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="truncate">
                    <span className="text-muted-foreground">actor:</span> {log.actor_email ?? "system"}
                  </span>
                  {log.target_id && (
                    <span className="truncate text-muted-foreground">request: {log.target_id}</span>
                  )}
                </div>
                {log.details && (
                  <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto">
                    {JSON.stringify(log.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            {logs.length === 0 && (
              <p className="text-sm text-muted-foreground">Пока нет зафиксированных действий.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ModeratorDashboard;

