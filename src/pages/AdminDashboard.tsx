import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth, AppRole, Profile } from "@/hooks/useAuth";
import {
  apiAdminOverview,
  apiAdminUpdateUserRole,
  apiAdminBlockUser,
  apiAdminUpdateUserName,
  apiAdminHandleRequest,
  apiAdminCreateUser,
  apiAdminCreateRoleRequest,
  apiAdminUpdateRoleRequest,
  apiAdminCreateDepartment,
  apiAdminUpdateDepartment,
  apiAdminDeleteDepartment,
  apiAdminCreateProject,
  apiAdminUpdateProject,
  apiAdminDeleteProject,
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

interface ProjectEditForm {
  name: string;
  code: string;
  description: string;
  color: string;
  owner_profile_id: string;
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
  const [deptDrafts, setDeptDrafts] = useState<Record<number, { name: string; description: string }>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectEditForm | null>(null);
  const [memberEmailByProject, setMemberEmailByProject] = useState<Record<number, string>>({});
  const [deptAddForProject, setDeptAddForProject] = useState<Record<number, string>>({});
  const [deptDeleteId, setDeptDeleteId] = useState<number | null>(null);
  const [projectDeleteId, setProjectDeleteId] = useState<number | null>(null);

  // Users: create form (creates profile + optional role request)
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserRequestedRole, setNewUserRequestedRole] = useState<AppRole>("user");

  // Role requests: create + per-row drafts
  const [newRequestEmail, setNewRequestEmail] = useState("");
  const [newRequestFullName, setNewRequestFullName] = useState("");
  const [newRequestRoleRequested, setNewRequestRoleRequested] = useState<AppRole>("moderator");
  const [requestDrafts, setRequestDrafts] = useState<
    Record<number, { email: string; full_name: string; role_requested: AppRole }>
  >({});

  useEffect(() => {
    setDeptDrafts(
      Object.fromEntries(
        departments.map((d) => [d.id, { name: d.name, description: d.description ?? "" }]),
      ),
    );
  }, [departments]);

  useEffect(() => {
    setRequestDrafts(
      Object.fromEntries(
        requests.map((r) => [r.id, { email: r.email, full_name: r.full_name ?? "", role_requested: r.role_requested }]),
      ),
    );
  }, [requests]);

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
    const currentlyBlocked = Boolean(user.is_blocked);
    const nextBlocked = !currentlyBlocked;
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

  const handleCreateUser = async () => {
    try {
      if (!newUserEmail.trim() || !newUserPassword.trim()) {
        toast({ title: "Заполните email и пароль", variant: "destructive" });
        return;
      }

      await apiAdminCreateUser({
        email: newUserEmail.trim(),
        password: newUserPassword,
        full_name: newUserFullName.trim() || null,
        requestedRole: newUserRequestedRole,
      });

      toast({ title: "Пользователь создан" });
      setNewUserEmail("");
      setNewUserFullName("");
      setNewUserPassword("");
      setNewUserRequestedRole("user");
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка создания пользователя", description: error?.message ?? "Не удалось создать пользователя", variant: "destructive" });
    }
  };

  const handleCreateRoleRequest = async () => {
    try {
      if (!newRequestEmail.trim()) {
        toast({ title: "Заполните email", variant: "destructive" });
        return;
      }

      await apiAdminCreateRoleRequest({
        email: newRequestEmail.trim(),
        full_name: newRequestFullName.trim() || null,
        role_requested: newRequestRoleRequested,
      });

      toast({ title: "Заявка создана" });
      setNewRequestEmail("");
      setNewRequestFullName("");
      setNewRequestRoleRequested("moderator");
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка создания заявки", description: error?.message ?? "Не удалось создать заявку", variant: "destructive" });
    }
  };

  const handleUpdateRoleRequest = async (requestId: number) => {
    try {
      const draft = requestDrafts[requestId];
      if (!draft) return;

      await apiAdminUpdateRoleRequest(requestId, {
        email: draft.email.trim(),
        full_name: draft.full_name.trim() || null,
        role_requested: draft.role_requested,
      });

      toast({ title: "Заявка обновлена" });
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка сохранения заявки", description: error?.message ?? "Не удалось обновить заявку", variant: "destructive" });
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

  const handleSaveDepartment = async (departmentId: number) => {
    const draft = deptDrafts[departmentId];
    if (!draft?.name?.trim()) {
      toast({ title: "Укажите название отдела", variant: "destructive" });
      return;
    }
    try {
      const updated = await apiAdminUpdateDepartment(departmentId, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
      });
      setDepartments((prev) => prev.map((d) => (d.id === departmentId ? (updated as Department) : d)));
      toast({ title: "Отдел сохранён" });
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка сохранения отдела", description: error?.message ?? "", variant: "destructive" });
    }
  };

  const confirmDeleteDepartment = async () => {
    if (deptDeleteId == null) return;
    try {
      await apiAdminDeleteDepartment(deptDeleteId);
      setDepartments((prev) => prev.filter((d) => d.id !== deptDeleteId));
      setProjectDepartments((prev) => prev.filter((pd) => pd.department_id !== deptDeleteId));
      toast({ title: "Отдел удалён" });
      setDeptDeleteId(null);
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка удаления отдела", description: error?.message ?? "", variant: "destructive" });
    }
  };

  const toggleProjectDetails = (p: Project) => {
    if (expandedProjectId === p.id) {
      setExpandedProjectId(null);
      setProjectForm(null);
    } else {
      setExpandedProjectId(p.id);
      setProjectForm({
        name: p.name,
        code: p.code ?? "",
        description: p.description ?? "",
        color: p.color ?? "#4f46e5",
        owner_profile_id: p.owner_profile_id ?? "",
      });
    }
  };

  const handleSaveProjectDetails = async (projectId: number) => {
    if (!projectForm?.name?.trim()) {
      toast({ title: "Укажите название проекта", variant: "destructive" });
      return;
    }
    try {
      const updated = await apiAdminUpdateProject(projectId, {
        name: projectForm.name.trim(),
        code: projectForm.code.trim() || null,
        description: projectForm.description.trim() || null,
        color: projectForm.color || null,
        owner_profile_id: projectForm.owner_profile_id || null,
      });
      setProjects((prev) => prev.map((p) => (p.id === projectId ? (updated as Project) : p)));
      toast({ title: "Проект обновлён" });
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка сохранения проекта", description: error?.message ?? "", variant: "destructive" });
    }
  };

  const confirmDeleteProject = async () => {
    if (projectDeleteId == null) return;
    try {
      await apiAdminDeleteProject(projectDeleteId);
      setProjects((prev) => prev.filter((p) => p.id !== projectDeleteId));
      setProjectMembers((prev) => prev.filter((pm) => pm.project_id !== projectDeleteId));
      setProjectDepartments((prev) => prev.filter((pd) => pd.project_id !== projectDeleteId));
      if (expandedProjectId === projectDeleteId) {
        setExpandedProjectId(null);
        setProjectForm(null);
      }
      toast({ title: "Проект удалён" });
      setProjectDeleteId(null);
      loadData();
    } catch (error: any) {
      toast({ title: "Ошибка удаления проекта", description: error?.message ?? "", variant: "destructive" });
    }
  };

  const addMemberFromExpanded = async (projectId: number) => {
    const email = (memberEmailByProject[projectId] ?? "").trim();
    if (!email) return;
    await handleAddMemberToProject(projectId, email);
    setMemberEmailByProject((prev) => ({ ...prev, [projectId]: "" }));
  };

  const addDeptFromExpanded = async (projectId: number) => {
    const raw = deptAddForProject[projectId];
    const departmentId = raw ? Number(raw) : NaN;
    if (!Number.isFinite(departmentId)) return;
    await handleAddDepartmentToProject(projectId, departmentId);
    setDeptAddForProject((prev) => ({ ...prev, [projectId]: "" }));
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
              <div className="border-b pb-4 space-y-3">
                <h3 className="text-lg font-semibold">Добавить пользователя</h3>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[220px]">
                    <Input
                      className="h-9 text-base"
                      placeholder="Email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <Input
                      className="h-9 text-base"
                      placeholder="Имя (опционально)"
                      value={newUserFullName}
                      onChange={(e) => setNewUserFullName(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <Input
                      className="h-9 text-base"
                      placeholder="Пароль"
                      type="password"
                      value={newUserPassword}
                      onChange={(e) => setNewUserPassword(e.target.value)}
                    />
                  </div>
                  <div className="min-w-[200px]">
                    <Select value={newUserRequestedRole} onValueChange={(v: AppRole) => setNewUserRequestedRole(v)}>
                      <SelectTrigger className="w-[200px] h-9 text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">user</SelectItem>
                        <SelectItem value="moderator">moderator</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateUser} disabled={!newUserEmail.trim() || !newUserPassword.trim()} className="h-9 px-4">
                    Создать
                  </Button>
                </div>
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
                            {Boolean(u.is_blocked) && (
                              <Badge variant="destructive" className="w-fit text-xs uppercase tracking-wide">
                                BLOCKED
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant={Boolean(u.is_blocked) ? "default" : "outline"}
                              className="h-9 px-3 text-xs mt-1"
                              onClick={() => handleBlockToggle(u)}
                            >
                              {Boolean(u.is_blocked) ? "Разблокировать" : "Заблокировать"}
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
              <div className="border-b pb-4 space-y-3">
                <h3 className="text-lg font-semibold">Добавить заявку</h3>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[220px]">
                    <Input
                      className="h-9 text-base"
                      placeholder="Email"
                      value={newRequestEmail}
                      onChange={(e) => setNewRequestEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-w-[220px]">
                    <Input
                      className="h-9 text-base"
                      placeholder="Имя (опционально)"
                      value={newRequestFullName}
                      onChange={(e) => setNewRequestFullName(e.target.value)}
                    />
                  </div>
                  <div className="min-w-[200px]">
                    <Select value={newRequestRoleRequested} onValueChange={(v: AppRole) => setNewRequestRoleRequested(v)}>
                      <SelectTrigger className="w-[200px] h-9 text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="moderator">moderator</SelectItem>
                        <SelectItem value="admin">admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateRoleRequest} disabled={!newRequestEmail.trim()} className="h-9 px-4">
                    Создать
                  </Button>
                </div>
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
                    {requests.map((r) => {
                      const draft = requestDrafts[r.id] ?? {
                        email: r.email,
                        full_name: r.full_name ?? "",
                        role_requested: r.role_requested,
                      };

                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Input
                              className="h-9 text-base"
                              value={draft.email}
                              onChange={(e) => {
                                const email = e.target.value;
                                setRequestDrafts((prev) => ({
                                  ...prev,
                                  [r.id]: { ...draft, email },
                                }));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="h-9 text-base"
                              value={draft.full_name}
                              onChange={(e) => {
                                const full_name = e.target.value;
                                setRequestDrafts((prev) => ({
                                  ...prev,
                                  [r.id]: { ...draft, full_name },
                                }));
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={draft.role_requested}
                              onValueChange={(v: AppRole) =>
                                setRequestDrafts((prev) => ({
                                  ...prev,
                                  [r.id]: { ...draft, role_requested: v },
                                }))
                              }
                            >
                              <SelectTrigger className="w-[160px] h-9 text-base">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="moderator">moderator</SelectItem>
                                <SelectItem value="admin">admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>{new Date(r.created_at).toLocaleString("ru-RU")}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleUpdateRoleRequest(r.id)}
                              >
                                Сохранить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRequest(r.id, "approve", draft.role_requested, draft.email)}
                              >
                                Одобрить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive border-destructive/50"
                                onClick={() => handleRequest(r.id, "reject", draft.role_requested, draft.email)}
                              >
                                Отклонить
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                      <TableHead className="w-[220px] text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="[&>tr>td]:py-3">
                    {departments.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Input
                            className="h-9 text-base"
                            value={deptDrafts[d.id]?.name ?? d.name}
                            onChange={(e) =>
                              setDeptDrafts((prev) => ({
                                ...prev,
                                [d.id]: {
                                  name: e.target.value,
                                  description: prev[d.id]?.description ?? d.description ?? "",
                                },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            className="h-9 text-base"
                            placeholder="Описание"
                            value={deptDrafts[d.id]?.description ?? d.description ?? ""}
                            onChange={(e) =>
                              setDeptDrafts((prev) => ({
                                ...prev,
                                [d.id]: {
                                  name: prev[d.id]?.name ?? d.name,
                                  description: e.target.value,
                                },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap gap-2 justify-end">
                            <Button size="sm" variant="secondary" className="h-9" onClick={() => handleSaveDepartment(d.id)}>
                              Сохранить
                            </Button>
                            <Button size="sm" variant="outline" className="h-9 text-destructive" onClick={() => setDeptDeleteId(d.id)}>
                              Удалить
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {departments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-base text-muted-foreground text-center py-6">
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
                      const expanded = expandedProjectId === p.id;
                      const availableDepts = departments.filter(
                        (d) => !projDepts.some((pd) => pd.department_id === d.id),
                      );
                      return (
                        <Fragment key={p.id}>
                          <TableRow>
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
                                  variant="secondary"
                                  className="h-8 px-3 text-xs"
                                  onClick={() => toggleProjectDetails(p)}
                                >
                                  {expanded ? "Свернуть" : "Детали"}
                                </Button>
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
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8 px-3 text-xs text-destructive border-destructive/40"
                                  onClick={() => setProjectDeleteId(p.id)}
                                >
                                  Удалить
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {expanded && projectForm && (
                            <TableRow>
                              <TableCell colSpan={6} className="align-top bg-muted/20 border-t">
                                <div className="space-y-4 py-2 text-sm">
                                  <p className="font-medium text-base">Редактирование и доступы</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                      <label className="text-xs text-muted-foreground">Название</label>
                                      <Input
                                        className="h-9"
                                        value={projectForm.name}
                                        onChange={(e) => setProjectForm((f) => (f ? { ...f, name: e.target.value } : f))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-muted-foreground">Код</label>
                                      <Input
                                        className="h-9"
                                        value={projectForm.code}
                                        onChange={(e) => setProjectForm((f) => (f ? { ...f, code: e.target.value } : f))}
                                      />
                                    </div>
                                    <div className="space-y-1 md:col-span-2">
                                      <label className="text-xs text-muted-foreground">Описание</label>
                                      <Textarea
                                        className="min-h-[72px] text-sm"
                                        value={projectForm.description}
                                        onChange={(e) =>
                                          setProjectForm((f) => (f ? { ...f, description: e.target.value } : f))
                                        }
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-muted-foreground">Цвет</label>
                                      <Input
                                        type="color"
                                        className="h-9 w-full max-w-[120px]"
                                        value={projectForm.color}
                                        onChange={(e) => setProjectForm((f) => (f ? { ...f, color: e.target.value } : f))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-xs text-muted-foreground">Владелец</label>
                                      <Select
                                        value={projectForm.owner_profile_id || "none"}
                                        onValueChange={(v) =>
                                          setProjectForm((f) => (f ? { ...f, owner_profile_id: v === "none" ? "" : v } : f))
                                        }
                                      >
                                        <SelectTrigger className="h-9">
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
                                    </div>
                                  </div>
                                  <Button size="sm" className="h-9" onClick={() => handleSaveProjectDetails(p.id)}>
                                    Сохранить изменения проекта
                                  </Button>

                                  <div className="border-t pt-3 space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                      Участники проекта
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {members.map((m) => (
                                        <Badge key={m.profile_id} variant="outline" className="gap-1 pl-2 pr-1">
                                          {users.find((u) => u.id === m.profile_id)?.email ?? m.profile_id.slice(0, 8)}
                                          <button
                                            type="button"
                                            className="rounded px-1 hover:bg-muted"
                                            onClick={() => handleRemoveMemberFromProject(p.id, m.profile_id)}
                                            aria-label="Удалить участника"
                                          >
                                            ×
                                          </button>
                                        </Badge>
                                      ))}
                                      {members.length === 0 && (
                                        <span className="text-xs text-muted-foreground">Пока никого нет</span>
                                      )}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center max-w-md">
                                      <Input
                                        className="h-9 flex-1"
                                        placeholder="Email пользователя"
                                        value={memberEmailByProject[p.id] ?? ""}
                                        onChange={(e) =>
                                          setMemberEmailByProject((prev) => ({ ...prev, [p.id]: e.target.value }))
                                        }
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            addMemberFromExpanded(p.id);
                                          }
                                        }}
                                      />
                                      <Button size="sm" variant="outline" className="h-9" type="button" onClick={() => addMemberFromExpanded(p.id)}>
                                        Добавить участника
                                      </Button>
                                    </div>
                                  </div>

                                  <div className="border-t pt-3 space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                                      Отделы в проекте
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {projDepts.map((pd) => (
                                        <Badge key={pd.department_id} variant="secondary" className="gap-1 pl-2 pr-1">
                                          {departmentsById[pd.department_id]?.name ?? pd.department_id}
                                          <button
                                            type="button"
                                            className="rounded px-1 hover:bg-muted"
                                            onClick={() =>
                                              handleRemoveDepartmentFromProject(p.id, pd.department_id)
                                            }
                                            aria-label="Отвязать отдел"
                                          >
                                            ×
                                          </button>
                                        </Badge>
                                      ))}
                                      {projDepts.length === 0 && (
                                        <span className="text-xs text-muted-foreground">Отделы не привязаны</span>
                                      )}
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center max-w-md">
                                      <Select
                                        value={deptAddForProject[p.id] ?? ""}
                                        onValueChange={(v) =>
                                          setDeptAddForProject((prev) => ({ ...prev, [p.id]: v }))
                                        }
                                      >
                                        <SelectTrigger className="h-9 flex-1">
                                          <SelectValue placeholder="Выберите отдел" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableDepts.map((d) => (
                                            <SelectItem key={d.id} value={String(d.id)}>
                                              {d.name}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-9"
                                        type="button"
                                        disabled={!deptAddForProject[p.id] || availableDepts.length === 0}
                                        onClick={() => addDeptFromExpanded(p.id)}
                                      >
                                        Привязать отдел
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
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

        <AlertDialog open={deptDeleteId != null} onOpenChange={(open) => !open && setDeptDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить отдел?</AlertDialogTitle>
              <AlertDialogDescription>
                Будут удалены связи отдела с проектами и данные участников этого отдела. Действие необратимо.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteDepartment}>
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={projectDeleteId != null} onOpenChange={(open) => !open && setProjectDeleteId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить проект?</AlertDialogTitle>
              <AlertDialogDescription>
                Все задачи и связи проекта будут удалены. Действие необратимо.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteProject}>
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default AdminDashboard;

