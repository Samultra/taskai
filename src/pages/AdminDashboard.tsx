import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth, AppRole, Profile } from "@/hooks/useAuth";
import {
  apiAdminOverview,
  apiAdminUpdateUserRole,
  apiAdminBlockUser,
  apiAdminUpdateUserName,
  apiAdminHandleRequest,
  apiAdminCreateDepartment,
  apiAdminCreateProject,
  apiAdminToggleArchiveProject,
  apiAdminAddMemberToProject,
  apiAdminRemoveMemberFromProject,
  apiAdminAddDepartmentToProject,
  apiAdminRemoveDepartmentFromProject,
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

interface Department {
  id: number;
  name: string;
  description: string | null;
}

interface Project {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
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

interface ProjectDepartment {
  project_id: number;
  department_id: number;
}

const AdminDashboard = () => {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [projectDepartments, setProjectDepartments] = useState<ProjectDepartment[]>([]);
  const [newDeptName, setNewDeptName] = useState("");
  const [newDeptDesc, setNewDeptDesc] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectCode, setNewProjectCode] = useState("");
  const [newProjectColor, setNewProjectColor] = useState("#4f46e5");
  const [newProjectOwnerId, setNewProjectOwnerId] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await apiAdminOverview();
      setUsers((data.users ?? []) as Profile[]);
      setRequests((data.requests ?? []) as RegistrationRequest[]);
      setLogs((data.logs ?? []) as ActivityLog[]);
      setDepartments((data.departments ?? []) as Department[]);
      setProjects((data.projects ?? []) as Project[]);
      setProjectMembers((data.projectMembers ?? []) as ProjectMember[]);
      setProjectDepartments((data.projectDepartments ?? []) as ProjectDepartment[]);
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Ошибка загрузки данных",
        description: error?.message ?? "Не удалось загрузить данные админ-панели",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const projectsById = useMemo(
    () =>
      projects.reduce<Record<number, Project>>((acc, p) => {
        acc[p.id] = p;
        return acc;
      }, {}),
    [projects]
  );

  const departmentsById = useMemo(
    () =>
      departments.reduce<Record<number, Department>>((acc, d) => {
        acc[d.id] = d;
        return acc;
      }, {}),
    [departments]
  );

  const projectsByUserId = useMemo(() => {
    const map = new Map<string, Project[]>();
    projectMembers.forEach((pm) => {
      const project = projectsById[pm.project_id];
      if (!project) return;
      const arr = map.get(pm.profile_id) ?? [];
      arr.push(project);
      map.set(pm.profile_id, arr);
    });
    return map;
  }, [projectMembers, projectsById]);

  const handleRoleChange = async (userId: string, role: AppRole) => {
    try {
      await apiAdminUpdateUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast({ title: "Роль обновлена", description: "Роль пользователя успешно изменена." });
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка смены роли", description: error?.message ?? "Не удалось обновить роль", variant: "destructive" });
    }
  };

  const handleBlockToggle = async (user: Profile) => {
    const nextBlocked = !user.is_blocked;
    try {
      await apiAdminBlockUser(user.id, nextBlocked);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_blocked: nextBlocked } : u)));
      toast({
        title: nextBlocked ? "Пользователь заблокирован" : "Пользователь разблокирован",
        description: user.email,
      });
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка изменения статуса", description: error?.message ?? "Не удалось изменить статус", variant: "destructive" });
    }
  };

  const handleNameChange = async (userId: string, fullName: string) => {
    try {
      await apiAdminUpdateUserName(userId, fullName);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, full_name: fullName } : u)));
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка сохранения имени", description: error?.message ?? "Не удалось сохранить имя", variant: "destructive" });
    }
  };

  const handleRequest = async (id: number, action: "approve" | "reject", requestedRole: AppRole, email: string) => {
    try {
      await apiAdminHandleRequest(id, action, requestedRole, email);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast({
        title: action === "approve" ? "Заявка одобрена" : "Заявка отклонена",
      });
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка обновления заявки", description: error?.message ?? "Не удалось обновить заявку", variant: "destructive" });
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) return;
    try {
      const dep = await apiAdminCreateDepartment({
        name: newDeptName.trim(),
        description: newDeptDesc.trim() || undefined,
      });
      setDepartments((prev) => [...prev, dep as Department]);
      setNewDeptName("");
      setNewDeptDesc("");
      toast({ title: "Отдел создан" });
    } catch (error: any) {
      toast({ title: "Ошибка создания отдела", description: error?.message ?? "Не удалось создать отдел", variant: "destructive" });
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const payload: any = {
        name: newProjectName.trim(),
        code: newProjectCode.trim() || null,
        color: newProjectColor || null,
        owner_profile_id: newProjectOwnerId || null,
      };
      const proj = await apiAdminCreateProject(payload);
      setProjects((prev) => [proj as Project, ...prev]);
      setNewProjectName("");
      setNewProjectCode("");
      setNewProjectOwnerId("");
      toast({ title: "Проект создан" });
    } catch (error: any) {
      toast({ title: "Ошибка создания проекта", description: error?.message ?? "Не удалось создать проект", variant: "destructive" });
    }
  };

  const handleToggleArchiveProject = async (project: Project) => {
    const next = !project.is_archived;
    try {
      await apiAdminToggleArchiveProject(project.id, next);
      setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, is_archived: next } : p)));
      toast({ title: next ? "Проект архивирован" : "Проект разархивирован" });
    } catch (error: any) {
      toast({ title: "Ошибка обновления проекта", description: error?.message ?? "Не удалось обновить проект", variant: "destructive" });
    }
  };

  const handleAddMemberToProject = async (projectId: number, email: string) => {
    if (!email.trim()) return;
    try {
      const result = await apiAdminAddMemberToProject(projectId, email.trim());
      setProjectMembers((prev) => [...prev, { project_id: result.project_id, profile_id: result.profile_id, role: result.role }]);
      toast({ title: "Участник добавлен", description: email });
    } catch (error: any) {
      toast({ title: "Пользователь не найден или ошибка добавления", description: error?.message ?? email, variant: "destructive" });
    }
  };

  const handleRemoveMemberFromProject = async (projectId: number, profileId: string) => {
    try {
      await apiAdminRemoveMemberFromProject(projectId, profileId);
      setProjectMembers((prev) => prev.filter((pm) => !(pm.project_id === projectId && pm.profile_id === profileId)));
    } catch (error: any) {
      toast({ title: "Ошибка удаления участника", description: error?.message ?? "Не удалось удалить участника", variant: "destructive" });
    }
  };

  const handleAddDepartmentToProject = async (projectId: number, departmentId: number) => {
    try {
      const result = await apiAdminAddDepartmentToProject(projectId, departmentId);
      setProjectDepartments((prev) => [...prev, { project_id: result.project_id, department_id: result.department_id }]);
    } catch (error: any) {
      toast({ title: "Ошибка привязки отдела", description: error?.message ?? "Не удалось привязать отдел", variant: "destructive" });
    }
  };

  const handleRemoveDepartmentFromProject = async (projectId: number, departmentId: number) => {
    try {
      await apiAdminRemoveDepartmentFromProject(projectId, departmentId);
      setProjectDepartments((prev) =>
        prev.filter((pd) => !(pd.project_id === projectId && pd.department_id === departmentId))
      );
    } catch (error: any) {
      toast({ title: "Ошибка отвязки отдела", description: error?.message ?? "Не удалось отвязать отдел", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold">Админ-панель</h1>
            <p className="text-muted-foreground text-base mt-1">
              Управление пользователями, заявками, отделами и проектами. Вы вошли как {profile?.email}.
            </p>
          </div>
          <Button variant="outline" size="lg" onClick={loadData} disabled={loading}>
            Обновить данные
          </Button>
        </header>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="flex flex-wrap gap-2 justify-start">
            <TabsTrigger value="users" className="px-4 py-2 text-sm">
              Пользователи
            </TabsTrigger>
            <TabsTrigger value="requests" className="px-4 py-2 text-sm">
              Заявки на роли
            </TabsTrigger>
            <TabsTrigger value="departments" className="px-4 py-2 text-sm">
              Отделы
            </TabsTrigger>
            <TabsTrigger value="projects" className="px-4 py-2 text-sm">
              Проекты и доступы
            </TabsTrigger>
            <TabsTrigger value="logs" className="px-4 py-2 text-sm">
              Логи действий
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <Card className="p-6 space-y-4 glass-effect shadow-card border border-border/80">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Пользователи</h2>
                <Badge variant="outline" className="text-base px-4 py-1.5">{users.length}</Badge>
              </div>
              <div className="overflow-auto pr-1 text-base">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Имя</TableHead>
                      <TableHead>Роль</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>Проекты</TableHead>
                      <TableHead>Создан</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr>td]:py-3">
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{u.email}</span>
                            <span className="text-sm text-muted-foreground">ID: {u.id.slice(0, 8)}...</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-9 text-base"
                            defaultValue={u.full_name ?? ""}
                            placeholder="Имя пользователя"
                            onBlur={(e) => {
                              if (e.target.value !== (u.full_name ?? "")) {
                                handleNameChange(u.id, e.target.value);
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Select value={u.role} onValueChange={(value: AppRole) => handleRoleChange(u.id, value)}>
                            <SelectTrigger className="w-[140px] h-9 text-base">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">user</SelectItem>
                              <SelectItem value="moderator">moderator</SelectItem>
                              <SelectItem value="admin">admin</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="w-fit text-xs uppercase tracking-wide">
                              {u.role}
                            </Badge>
                            {u.is_blocked && (
                              <Badge variant="destructive" className="w-fit text-xs uppercase tracking-wide">
                                BLOCKED
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant={u.is_blocked ? "default" : "outline"}
                              className="h-9 px-3 text-xs mt-1"
                              onClick={() => handleBlockToggle(u)}
                            >
                              {u.is_blocked ? "Разблокировать" : "Заблокировать"}
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          {projectsByUserId.get(u.id)?.length ? (
                            <span className="text-sm text-muted-foreground">
                              {projectsByUserId
                                .get(u.id)!
                                .map((p) => p.code || p.name)
                                .join(", ")}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">нет</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.created_at ? new Date(u.created_at).toLocaleString("ru-RU") : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-base text-muted-foreground text-center py-6">
                          Пока нет пользователей.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="requests">
            <Card className="p-6 space-y-4 glass-effect shadow-card border border-border/80">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Заявки на роли</h2>
                <Badge variant="outline" className="text-base px-4 py-1.5">{requests.length}</Badge>
              </div>
              <div className="overflow-auto pr-1 text-base">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Имя</TableHead>
                      <TableHead>Роль</TableHead>
                      <TableHead>Отправлена</TableHead>
                      <TableHead className="w-[200px]">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr>td]:py-3">
                    {requests.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.email}</TableCell>
                        <TableCell>{r.full_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge>{r.role_requested}</Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(r.created_at).toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 justify-end">
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
                        </TableCell>
                      </TableRow>
                    ))}
                    {requests.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-base text-muted-foreground text-center py-6">
                          Нет заявок на повышенные роли.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="departments">
            <Card className="p-6 space-y-4 glass-effect shadow-card border border-border/80">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Отделы</h2>
                <Badge variant="outline" className="text-base px-4 py-1.5">{departments.length}</Badge>
              </div>
              <div className="space-y-4 overflow-auto pr-1 text-base">
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Название отдела"
                      value={newDeptName}
                      onChange={(e) => setNewDeptName(e.target.value)}
                      className="h-9 text-base"
                    />
                    <Input
                      placeholder="Описание (опционально)"
                      value={newDeptDesc}
                      onChange={(e) => setNewDeptDesc(e.target.value)}
                      className="h-9 text-base"
                    />
                  </div>
                  <Button onClick={handleCreateDepartment} disabled={!newDeptName.trim()} className="h-9 px-4">
                    Создать отдел
                  </Button>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Название</TableHead>
                      <TableHead>Описание</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr>td]:py-3">
                    {departments.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell className="text-base text-muted-foreground">
                          {d.description || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {departments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-base text-muted-foreground text-center py-6">
                          Пока нет отделов. Создайте первый выше.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="projects">
            <Card className="p-6 space-y-4 glass-effect shadow-card border border-border/80">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Проекты и доступы</h2>
                <Badge variant="outline" className="text-base px-4 py-1.5">{projects.length}</Badge>
              </div>
              <div className="space-y-4 overflow-auto pr-1 text-base">
                <div className="border-b pb-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Input
                      placeholder="Название проекта"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      className="h-9 text-base"
                    />
                    <Input
                      placeholder="Код (например, CRM, MOBILE)"
                      value={newProjectCode}
                      onChange={(e) => setNewProjectCode(e.target.value)}
                      className="h-9 text-base"
                    />
                    <Input
                      type="color"
                      value={newProjectColor}
                      onChange={(e) => setNewProjectColor(e.target.value)}
                      className="h-9"
                    />
                    <Select value={newProjectOwnerId} onValueChange={setNewProjectOwnerId}>
                      <SelectTrigger className="h-9 text-base">
                        <SelectValue placeholder="Владелец (опционально)" />
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
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleCreateProject}
                      disabled={!newProjectName.trim()}
                      className="h-9 px-4 text-sm"
                    >
                      Создать проект
                    </Button>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Проект</TableHead>
                      <TableHead>Владелец</TableHead>
                      <TableHead>Участников</TableHead>
                      <TableHead>Отделов</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="w-[220px]">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr>td]:py-3">
                    {projects.map((p) => {
                      const ownerEmail = users.find((u) => u.id === p.owner_profile_id)?.email;
                      const members = projectMembers.filter((pm) => pm.project_id === p.id);
                      const projDepts = projectDepartments.filter((pd) => pd.project_id === p.id);
                      return (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {p.color && (
                                <span
                                  className="h-4 w-4 rounded-full border"
                                  style={{ backgroundColor: p.color }}
                                />
                              )}
                              <div className="min-w-0">
                                <p className="font-semibold truncate">
                                  {p.name} {p.code ? `(${p.code})` : ""}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  ID: {p.id} • {new Date(p.created_at).toLocaleString("ru-RU")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Участников: {members.length} • Отделов: {projDepts.length}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {ownerEmail ?? "не назначен"}
                            </span>
                          </TableCell>
                          <TableCell>{members.length}</TableCell>
                          <TableCell>{projDepts.length}</TableCell>
                          <TableCell>
                            <Badge variant={p.is_archived ? "outline" : "secondary"}>
                              {p.is_archived ? "Архив" : "Активен"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2 justify-end">
                              <Button
                                size="sm"
                                variant={p.is_archived ? "outline" : "default"}
                                className="h-8 px-3 text-xs"
                                onClick={() => handleToggleArchiveProject(p)}
                              >
                                {p.is_archived ? "Разархивировать" : "Архивировать"}
                              </Button>
                              <Button asChild size="sm" variant="outline" className="h-8 px-3 text-xs">
                                <Link to={`/projects/${p.id}`}>Задачи</Link>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {projects.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-base text-muted-foreground text-center py-6">
                          Пока нет проектов. Создайте первый выше.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card className="p-6 space-y-4 glass-effect shadow-card border border-border/80">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Логи действий</h2>
                <Badge variant="outline" className="text-base px-4 py-1.5">{logs.length}</Badge>
              </div>
              <div className="overflow-auto pr-1 text-base">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Время</TableHead>
                      <TableHead>Действие</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Актор</TableHead>
                      <TableHead>Цель</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr>td]:py-3">
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString("ru-RU")}
                        </TableCell>
                        <TableCell className="uppercase text-xs tracking-wide">
                          {log.action}
                        </TableCell>
                        <TableCell className="text-xs">
                          {log.target_type ?? "—"}
                        </TableCell>
                        <TableCell className="text-base truncate">
                          {log.actor_email ?? "system"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate">
                          {log.target_id ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {logs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-base text-muted-foreground text-center py-6">
                          Пока нет зафиксированных действий.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;

