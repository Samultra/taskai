import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth, AppRole, Profile } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";

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
      const [
        { data: usersData, error: usersError },
        { data: reqData, error: reqError },
        { data: logsData, error: logsError },
        { data: deptData, error: deptError },
        { data: projData, error: projError },
        { data: projMemData, error: projMemError },
        { data: projDeptData, error: projDeptError },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, email, full_name, role, is_blocked, created_at")
          .order("created_at", {
            ascending: true,
          }),
        supabase
          .from("registration_requests")
          .select("id, email, full_name, role_requested, status, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("activity_logs")
          .select("id, actor_email, action, target_type, target_id, details, created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase.from("departments").select("id, name, description").order("name", { ascending: true }),
        supabase
          .from("projects")
          .select("id, name, code, description, color, owner_profile_id, is_archived, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("project_members").select("project_id, profile_id, role"),
        supabase.from("project_departments").select("project_id, department_id"),
      ]);

      if (usersError) {
        console.error(usersError);
        toast({ title: "Ошибка загрузки пользователей", description: usersError.message, variant: "destructive" });
      } else {
        setUsers((usersData ?? []) as Profile[]);
      }

      if (reqError) {
        console.error(reqError);
        toast({
          title: "Ошибка загрузки заявок",
          description: reqError.message,
          variant: "destructive",
        });
      } else {
        setRequests((reqData ?? []) as RegistrationRequest[]);
      }

      if (logsError) {
        console.error(logsError);
      } else {
        setLogs((logsData ?? []) as ActivityLog[]);
      }
      if (deptError) {
        console.error(deptError);
      } else {
        setDepartments((deptData ?? []) as Department[]);
      }
      if (projError) {
        console.error(projError);
      } else {
        setProjects((projData ?? []) as Project[]);
      }
      if (projMemError) {
        console.error(projMemError);
      } else {
        setProjectMembers((projMemData ?? []) as ProjectMember[]);
      }
      if (projDeptError) {
        console.error(projDeptError);
      } else {
        setProjectDepartments((projDeptData ?? []) as ProjectDepartment[]);
      }
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
    const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
    if (error) {
      toast({ title: "Ошибка смены роли", description: error.message, variant: "destructive" });
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));

    // логируем действие
    if (profile) {
      await supabase.from("activity_logs").insert({
        actor_id: profile.id,
        actor_email: profile.email,
        action: "change_role",
        target_type: "user",
        target_id: userId,
        details: { new_role: role },
      });
      loadData();
    }

    toast({ title: "Роль обновлена", description: "Роль пользователя успешно изменена." });
  };

  const handleBlockToggle = async (user: Profile) => {
    const nextBlocked = !user.is_blocked;
    const { error } = await supabase.from("profiles").update({ is_blocked: nextBlocked }).eq("id", user.id);
    if (error) {
      toast({ title: "Ошибка изменения статуса", description: error.message, variant: "destructive" });
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_blocked: nextBlocked } : u)));

    if (profile) {
      await supabase.from("activity_logs").insert({
        actor_id: profile.id,
        actor_email: profile.email,
        action: nextBlocked ? "block_user" : "unblock_user",
        target_type: "user",
        target_id: user.id,
        details: { email: user.email },
      });
      loadData();
    }

    toast({
      title: nextBlocked ? "Пользователь заблокирован" : "Пользователь разблокирован",
      description: user.email,
    });
  };

  const handleNameChange = async (userId: string, fullName: string) => {
    const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (error) {
      toast({ title: "Ошибка сохранения имени", description: error.message, variant: "destructive" });
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, full_name: fullName } : u)));

    if (profile) {
      await supabase.from("activity_logs").insert({
        actor_id: profile.id,
        actor_email: profile.email,
        action: "update_full_name",
        target_type: "user",
        target_id: userId,
        details: { full_name: fullName },
      });
      loadData();
    }
  };

  const handleRequest = async (id: number, action: "approve" | "reject", requestedRole: AppRole, email: string) => {
    const status = action === "approve" ? "approved" : "rejected";
    const updates = {
      status,
      processed_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("registration_requests").update(updates).eq("id", id);
    if (error) {
      toast({ title: "Ошибка обновления заявки", description: error.message, variant: "destructive" });
      return;
    }

    if (action === "approve") {
      // пытаемся найти профиль по email и обновить роль
      const { data, error: findError } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
      if (!findError && data?.id) {
        await supabase.from("profiles").update({ role: requestedRole }).eq("id", data.id);
      }
    }

    setRequests((prev) => prev.filter((r) => r.id !== id));

    if (profile) {
      await supabase.from("activity_logs").insert({
        actor_id: profile.id,
        actor_email: profile.email,
        action: action === "approve" ? "approve_request" : "reject_request",
        target_type: "registration_request",
        target_id: String(id),
        details: { requested_role: requestedRole, email },
      });
      loadData();
    }

    toast({
      title: action === "approve" ? "Заявка одобрена" : "Заявка отклонена",
    });
  };

  const handleCreateDepartment = async () => {
    if (!newDeptName.trim()) return;
    const { data, error } = await supabase
      .from("departments")
      .insert({ name: newDeptName.trim(), description: newDeptDesc.trim() || null })
      .select("id, name, description")
      .single();
    if (error) {
      toast({ title: "Ошибка создания отдела", description: error.message, variant: "destructive" });
      return;
    }
    setDepartments((prev) => [...prev, data as Department]);
    setNewDeptName("");
    setNewDeptDesc("");
    toast({ title: "Отдел создан" });
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    const payload: any = {
      name: newProjectName.trim(),
      code: newProjectCode.trim() || null,
      color: newProjectColor || null,
      owner_profile_id: newProjectOwnerId || null,
    };
    const { data, error } = await supabase
      .from("projects")
      .insert(payload)
      .select("id, name, code, description, color, owner_profile_id, is_archived, created_at")
      .single();
    if (error) {
      toast({ title: "Ошибка создания проекта", description: error.message, variant: "destructive" });
      return;
    }
    setProjects((prev) => [data as Project, ...prev]);
    setNewProjectName("");
    setNewProjectCode("");
    setNewProjectOwnerId("");
    toast({ title: "Проект создан" });
  };

  const handleToggleArchiveProject = async (project: Project) => {
    const next = !project.is_archived;
    const { error } = await supabase.from("projects").update({ is_archived: next }).eq("id", project.id);
    if (error) {
      toast({ title: "Ошибка обновления проекта", description: error.message, variant: "destructive" });
      return;
    }
    setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, is_archived: next } : p)));
    toast({ title: next ? "Проект архивирован" : "Проект разархивирован" });
  };

  const handleAddMemberToProject = async (projectId: number, email: string) => {
    if (!email.trim()) return;
    const { data: profileRow, error: findError } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email.trim())
      .maybeSingle();
    if (findError || !profileRow?.id) {
      toast({ title: "Пользователь не найден", description: email, variant: "destructive" });
      return;
    }
    const { error } = await supabase
      .from("project_members")
      .insert({ project_id: projectId, profile_id: profileRow.id, role: "member" });
    if (error) {
      toast({ title: "Ошибка добавления участника", description: error.message, variant: "destructive" });
      return;
    }
    setProjectMembers((prev) => [...prev, { project_id: projectId, profile_id: profileRow.id, role: "member" }]);
    toast({ title: "Участник добавлен", description: email });
  };

  const handleRemoveMemberFromProject = async (projectId: number, profileId: string) => {
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("project_id", projectId)
      .eq("profile_id", profileId);
    if (error) {
      toast({ title: "Ошибка удаления участника", description: error.message, variant: "destructive" });
      return;
    }
    setProjectMembers((prev) => prev.filter((pm) => !(pm.project_id === projectId && pm.profile_id === profileId)));
  };

  const handleAddDepartmentToProject = async (projectId: number, departmentId: number) => {
    const { error } = await supabase
      .from("project_departments")
      .insert({ project_id: projectId, department_id: departmentId });
    if (error) {
      toast({ title: "Ошибка привязки отдела", description: error.message, variant: "destructive" });
      return;
    }
    setProjectDepartments((prev) => [...prev, { project_id: projectId, department_id: departmentId }]);
  };

  const handleRemoveDepartmentFromProject = async (projectId: number, departmentId: number) => {
    const { error } = await supabase
      .from("project_departments")
      .delete()
      .eq("project_id", projectId)
      .eq("department_id", departmentId);
    if (error) {
      toast({ title: "Ошибка отвязки отдела", description: error.message, variant: "destructive" });
      return;
    }
    setProjectDepartments((prev) =>
      prev.filter((pd) => !(pd.project_id === projectId && pd.department_id === departmentId))
    );
  };

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Админ-панель</h1>
            <p className="text-muted-foreground text-sm">
              Управление пользователями и заявками на роли. Вы вошли как {profile?.email}.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            Обновить данные
          </Button>
        </header>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="p-4 space-y-4 glass-effect shadow-card xl:col-span-2 border border-border/80">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Пользователи</h2>
              <Badge variant="outline">{users.length}</Badge>
            </div>
            <div className="space-y-3 max-h-[460px] overflow-auto pr-1">
              {users.map((u) => (
                <div key={u.id} className="flex flex-col gap-2 border-b pb-2 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.email}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        ID: {u.id.slice(0, 8)}... •{" "}
                        {u.created_at ? new Date(u.created_at).toLocaleString("ru-RU") : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={u.role} onValueChange={(value: AppRole) => handleRoleChange(u.id, value)}>
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">user</SelectItem>
                          <SelectItem value="moderator">moderator</SelectItem>
                          <SelectItem value="admin">admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant={u.is_blocked ? "default" : "outline"}
                        className="h-8 px-2 text-xs"
                        onClick={() => handleBlockToggle(u)}
                      >
                        {u.is_blocked ? "Разблокировать" : "Заблокировать"}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      className="h-8 text-xs"
                      defaultValue={u.full_name ?? ""}
                      placeholder="Имя пользователя"
                      onBlur={(e) => {
                        if (e.target.value !== (u.full_name ?? "")) {
                          handleNameChange(u.id, e.target.value);
                        }
                      }}
                    />
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {u.role}
                    </Badge>
                    {u.is_blocked && (
                      <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">
                        BLOCKED
                      </Badge>
                    )}
                    {projectsByUserId.get(u.id)?.length ? (
                      <span className="text-[10px] text-muted-foreground">
                        Проекты:{" "}
                        {projectsByUserId
                          .get(u.id)!
                          .map((p) => p.code || p.name)
                          .join(", ")}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">Проекты: нет</span>
                    )}
                  </div>
                </div>
              ))}
              {users.length === 0 && <p className="text-sm text-muted-foreground">Пока нет пользователей.</p>}
            </div>
          </Card>

          <Card className="p-4 space-y-4 glass-effect shadow-card border border-border/80">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Заявки на роли</h2>
              <Badge variant="outline">{requests.length}</Badge>
            </div>
            <div className="space-y-3 max-h-[460px] overflow-auto pr-1">
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
                <p className="text-sm text-muted-foreground">Нет заявок на повышенные роли.</p>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-4 glass-effect shadow-card border border-border/80">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Отделы</h2>
              <Badge variant="outline">{departments.length}</Badge>
            </div>
            <div className="space-y-3 max-h-[220px] overflow-auto pr-1 text-xs">
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Название отдела"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                  />
                  <Input
                    placeholder="Описание (опционально)"
                    value={newDeptDesc}
                    onChange={(e) => setNewDeptDesc(e.target.value)}
                  />
                </div>
                <Button onClick={handleCreateDepartment} disabled={!newDeptName.trim()}>
                  Создать отдел
                </Button>
              </div>
              {departments.map((d) => (
                <div key={d.id} className="border-b pb-1 last:border-b-0 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{d.name}</p>
                    {d.description && (
                      <p className="text-[11px] text-muted-foreground truncate">{d.description}</p>
                    )}
                  </div>
                </div>
              ))}
              {departments.length === 0 && (
                <p className="text-sm text-muted-foreground">Пока нет отделов. Создайте первый выше.</p>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-4 glass-effect shadow-card xl:col-span-3 border border-border/80">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Проекты и доступы</h2>
              <Badge variant="outline">{projects.length}</Badge>
            </div>
            <div className="space-y-3 max-h-[320px] overflow-auto pr-1 text-xs">
              <div className="border-b pb-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <Input
                    placeholder="Название проекта"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                  />
                  <Input
                    placeholder="Код (например, CRM, MOBILE)"
                    value={newProjectCode}
                    onChange={(e) => setNewProjectCode(e.target.value)}
                  />
                  <Input
                    type="color"
                    value={newProjectColor}
                    onChange={(e) => setNewProjectColor(e.target.value)}
                    className="h-9"
                  />
                  <Select value={newProjectOwnerId} onValueChange={setNewProjectOwnerId}>
                    <SelectTrigger className="h-9">
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
                  <Button size="sm" onClick={handleCreateProject} disabled={!newProjectName.trim()}>
                    Создать проект
                  </Button>
                </div>
              </div>

              {projects.map((p) => {
                const ownerEmail = users.find((u) => u.id === p.owner_profile_id)?.email;
                const members = projectMembers.filter((pm) => pm.project_id === p.id);
                const projDepts = projectDepartments.filter((pd) => pd.project_id === p.id);
                return (
                  <div key={p.id} className="border-b pb-2 last:border-b-0 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.color && (
                          <span
                            className="h-4 w-4 rounded-full border"
                            style={{ backgroundColor: p.color }}
                          />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {p.name} {p.code ? `(${p.code})` : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            ID: {p.id} • {new Date(p.created_at).toLocaleString("ru-RU")}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={p.is_archived ? "outline" : "default"}
                          className="h-7 px-2 text-[11px]"
                          onClick={() => handleToggleArchiveProject(p)}
                        >
                          {p.is_archived ? "Разархивировать" : "Архивировать"}
                        </Button>
                        <Button asChild size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                          <Link to={`/projects/${p.id}`}>Задачи</Link>
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="text-[11px] text-muted-foreground">
                        Владелец: {ownerEmail ?? "не назначен"}
                      </span>
                      <span className="text-[11px] text-muted-foreground">Участников: {members.length}</span>
                      <span className="text-[11px] text-muted-foreground">Отделов: {projDepts.length}</span>
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap gap-1 items-center">
                        {members.map((m) => {
                          const u = users.find((u) => u.id === m.profile_id);
                          return (
                            <Badge
                              key={m.project_id + m.profile_id}
                              variant="outline"
                              className="flex items-center gap-1 text-[10px]"
                            >
                              {u?.email ?? m.profile_id}
                              <button
                                type="button"
                                className="ml-1 text-[10px]"
                                onClick={() => handleRemoveMemberFromProject(p.id, m.profile_id)}
                              >
                                ×
                              </button>
                            </Badge>
                          );
                        })}
                        {members.length === 0 && (
                          <span className="text-[11px] text-muted-foreground">Нет участников</span>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <Input
                          className="h-8 text-xs"
                          placeholder="Email участника для добавления"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const target = e.target as HTMLInputElement;
                              const email = target.value;
                              handleAddMemberToProject(p.id, email);
                              target.value = "";
                            }
                          }}
                        />
                        <span className="text-[10px] text-muted-foreground">Enter для добавления участника</span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap gap-1 items-center">
                        {projDepts.map((pd) => {
                          const d = departmentsById[pd.department_id];
                          if (!d) return null;
                          return (
                            <Badge
                              key={pd.project_id + "-" + pd.department_id}
                              variant="outline"
                              className="flex items-center gap-1 text-[10px]"
                            >
                              {d.name}
                              <button
                                type="button"
                                className="ml-1 text-[10px]"
                                onClick={() => handleRemoveDepartmentFromProject(p.id, d.id)}
                              >
                                ×
                              </button>
                            </Badge>
                          );
                        })}
                        {projDepts.length === 0 && (
                          <span className="text-[11px] text-muted-foreground">Нет привязанных отделов</span>
                        )}
                      </div>
                      {departments.length > 0 && (
                        <div className="flex gap-2 items-center">
                          <Select
                            onValueChange={(value) =>
                              handleAddDepartmentToProject(p.id, Number.parseInt(value, 10))
                            }
                          >
                            <SelectTrigger className="h-8 w-44 text-[11px]">
                              <SelectValue placeholder="Добавить отдел" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((d) => (
                                <SelectItem key={d.id} value={String(d.id)}>
                                  {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-[10px] text-muted-foreground">
                            Привязка отделов к проекту
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {projects.length === 0 && (
                <p className="text-sm text-muted-foreground">Пока нет проектов. Создайте первый выше.</p>
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-4 glass-effect shadow-card xl:col-span-3 border border-border/80">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Логи действий</h2>
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
                      <span className="truncate text-muted-foreground">target: {log.target_id}</span>
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
    </div>
  );
};

export default AdminDashboard;

