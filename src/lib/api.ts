const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

interface ApiOptions extends RequestInit {
  auth?: boolean;
}

function getToken(): string | null {
  return localStorage.getItem("taskai_token");
}

function setToken(token: string | null) {
  if (token) {
    localStorage.setItem("taskai_token", token);
  } else {
    localStorage.removeItem("taskai_token");
  }
}

async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (options.auth) {
    const token = getToken();
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const json = JSON.parse(text);
      msg = json.error || json.message || text;
    } catch {
      // ignore
    }
    throw new Error(msg || `Request failed with status ${res.status}`);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export interface ApiProfile {
  id: string;
  email: string;
  full_name?: string | null;
  role: "user" | "moderator" | "admin";
  is_blocked?: boolean;
  created_at?: string;
}

export async function apiSignIn(email: string, password: string) {
  const data = await apiFetch<{ token: string; profile: ApiProfile }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data.profile;
}

export async function apiSignUp(params: {
  email: string;
  password: string;
  fullName?: string;
  requestedRole?: "user" | "moderator" | "admin";
}) {
  const data = await apiFetch<{ token: string; profile: ApiProfile }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      password: params.password,
      fullName: params.fullName,
      requestedRole: params.requestedRole,
    }),
  });
  setToken(data.token);
  return data.profile;
}

export async function apiGetCurrentProfile() {
  const token = getToken();
  if (!token) return null;
  try {
    const data = await apiFetch<{ profile: ApiProfile }>("/auth/me", { auth: true });
    return data.profile;
  } catch {
    setToken(null);
    return null;
  }
}

export async function apiSignOut() {
  setToken(null);
}

export async function apiGetTasks() {
  const data = await apiFetch<{ tasks: any[] }>("/tasks", { auth: true });
  return data.tasks;
}

export async function apiCreateTask(payload: any) {
  const data = await apiFetch<{ task: any }>("/tasks", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: true,
  });
  return data.task;
}

export async function apiUpdateTask(id: string | number, updates: any) {
  const data = await apiFetch<{ task: any }>(`/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
    auth: true,
  });
  return data.task;
}

export async function apiDeleteTask(id: string | number) {
  await apiFetch<void>(`/tasks/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

// Admin APIs

export async function apiAdminOverview() {
  return apiFetch<{
    users: any[];
    requests: any[];
    logs: any[];
    departments: any[];
    projects: any[];
    projectMembers: any[];
    projectDepartments: any[];
  }>("/admin/overview", { auth: true });
}

export async function apiAdminUpdateUserRole(userId: string, role: string) {
  await apiFetch("/admin/profiles/" + userId + "/role", {
    method: "POST",
    body: JSON.stringify({ role }),
    auth: true,
  });
}

export async function apiAdminBlockUser(userId: string, isBlocked: boolean) {
  await apiFetch("/admin/profiles/" + userId + "/block", {
    method: "POST",
    body: JSON.stringify({ is_blocked: isBlocked }),
    auth: true,
  });
}

export async function apiAdminUpdateUserName(userId: string, fullName: string) {
  await apiFetch("/admin/profiles/" + userId + "/name", {
    method: "POST",
    body: JSON.stringify({ full_name: fullName }),
    auth: true,
  });
}

export async function apiAdminHandleRequest(id: number, action: "approve" | "reject", requestedRole: string, email: string) {
  await apiFetch("/admin/requests/" + id + "/decision", {
    method: "POST",
    body: JSON.stringify({ action, requestedRole, email }),
    auth: true,
  });
}

export async function apiAdminCreateDepartment(payload: { name: string; description?: string }) {
  const data = await apiFetch<{ department: any }>("/admin/departments", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: true,
  });
  return data.department;
}

export async function apiAdminUpdateDepartment(id: number, payload: { name: string; description?: string | null }) {
  const data = await apiFetch<{ department: any }>("/admin/departments/" + id, {
    method: "PUT",
    body: JSON.stringify(payload),
    auth: true,
  });
  return data.department;
}

export async function apiAdminDeleteDepartment(id: number) {
  await apiFetch<void>("/admin/departments/" + id, {
    method: "DELETE",
    auth: true,
  });
}

export async function apiAdminCreateProject(payload: {
  name: string;
  code?: string | null;
  description?: string | null;
  color?: string | null;
  owner_profile_id?: string | null;
}) {
  const data = await apiFetch<{ project: any }>("/admin/projects", {
    method: "POST",
    body: JSON.stringify(payload),
    auth: true,
  });
  return data.project;
}

export async function apiAdminUpdateProject(
  projectId: number,
  payload: {
    name: string;
    code?: string | null;
    description?: string | null;
    color?: string | null;
    owner_profile_id?: string | null;
  },
) {
  const data = await apiFetch<{ project: any }>("/admin/projects/" + projectId, {
    method: "PUT",
    body: JSON.stringify(payload),
    auth: true,
  });
  return data.project;
}

export async function apiAdminDeleteProject(projectId: number) {
  await apiFetch<void>("/admin/projects/" + projectId, {
    method: "DELETE",
    auth: true,
  });
}

export async function apiAdminToggleArchiveProject(projectId: number, isArchived: boolean) {
  await apiFetch("/admin/projects/" + projectId + "/archive", {
    method: "POST",
    body: JSON.stringify({ is_archived: isArchived }),
    auth: true,
  });
}

export async function apiAdminAddMemberToProject(projectId: number, email: string) {
  const data = await apiFetch<{ project_id: number; profile_id: string; role: string }>(
    "/admin/projects/" + projectId + "/members",
    {
      method: "POST",
      body: JSON.stringify({ email }),
      auth: true,
    },
  );
  return data;
}

export async function apiAdminRemoveMemberFromProject(projectId: number, profileId: string) {
  await apiFetch<void>(`/admin/projects/${projectId}/members/${profileId}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function apiAdminAddDepartmentToProject(projectId: number, departmentId: number) {
  const data = await apiFetch<{ project_id: number; department_id: number }>(
    "/admin/projects/" + projectId + "/departments",
    {
      method: "POST",
      body: JSON.stringify({ department_id: departmentId }),
      auth: true,
    },
  );
  return data;
}

export async function apiAdminRemoveDepartmentFromProject(projectId: number, departmentId: number) {
  await apiFetch<void>(`/admin/projects/${projectId}/departments/${departmentId}`, {
    method: "DELETE",
    auth: true,
  });
}

// Moderator APIs

export async function apiModeratorOverview() {
  return apiFetch<{
    requests: any[];
    logs: any[];
    projects: any[];
    members: any[];
    tasks: any[];
    users: any[];
    departmentJoinRequests: any[];
  }>("/moderator/overview", { auth: true });
}

export async function apiModeratorHandleRequest(
  id: number,
  action: "approve" | "reject",
  requestedRole: string,
  email: string,
) {
  await apiFetch("/moderator/requests/" + id + "/decision", {
    method: "POST",
    body: JSON.stringify({ action, requestedRole, email }),
    auth: true,
  });
}

export async function apiModeratorUpdateUserRole(userId: string, role: string) {
  await apiFetch("/moderator/users/" + userId + "/role", {
    method: "POST",
    body: JSON.stringify({ role }),
    auth: true,
  });
}

export async function apiModeratorBlockUser(userId: string, isBlocked: boolean) {
  await apiFetch("/moderator/users/" + userId + "/block", {
    method: "POST",
    body: JSON.stringify({ is_blocked: isBlocked }),
    auth: true,
  });
}

export async function apiModeratorUpdateUserName(userId: string, fullName: string) {
  await apiFetch("/moderator/users/" + userId + "/name", {
    method: "POST",
    body: JSON.stringify({ full_name: fullName }),
    auth: true,
  });
}

export async function apiModeratorUpdateProjectMeta(
  projectId: number,
  updates: Partial<{ name: string; code: string | null; color: string | null }>,
) {
  await apiFetch("/moderator/projects/" + projectId + "/meta", {
    method: "POST",
    body: JSON.stringify(updates),
    auth: true,
  });
}

export async function apiModeratorAddMember(projectId: number, email: string) {
  const data = await apiFetch<{ project_id: number; profile_id: string; role: string }>(
    "/moderator/projects/" + projectId + "/members",
    {
      method: "POST",
      body: JSON.stringify({ email }),
      auth: true,
    },
  );
  return data;
}

export async function apiModeratorRemoveMember(projectId: number, profileId: string) {
  await apiFetch<void>(`/moderator/projects/${projectId}/members/${profileId}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function apiModeratorUpdateTask(
  id: number,
  updates: Partial<{ status: string; due_date: string | null; assignee_profile_id: string | null }>,
) {
  await apiFetch("/moderator/tasks/" + id, {
    method: "POST",
    body: JSON.stringify(updates),
    auth: true,
  });
}

// Project tasks APIs

export async function apiProjectList() {
  return apiFetch<{ projects: any[] }>("/projects", { auth: true });
}

export async function apiProjectDetail(projectId: number) {
  return apiFetch<{
    project: any;
    members: any[];
    tasks: any[];
    /** Только для admin: все незаблокированные профили для поля «Назначен». */
    assigneeProfiles?: { id: string; email: string; full_name?: string | null }[];
  }>(`/projects/${projectId}/detail`, { auth: true });
}

export async function apiProjectCreateTask(projectId: number, payload: any) {
  const data = await apiFetch<{ task: any }>(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(payload),
    auth: true,
  });
  return data.task;
}

export async function apiProjectUpdateTask(id: number, updates: any) {
  const data = await apiFetch<{ task: any }>(`/projects/tasks/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
    auth: true,
  });
  return data.task;
}

export async function apiProjectDeleteTask(id: number) {
  await apiFetch<void>(`/projects/tasks/${id}`, {
    method: "DELETE",
    auth: true,
  });
}

// Departments APIs

export async function apiGetDepartmentsWithMembers() {
  return apiFetch<{ departments: any[] }>("/departments/with-members", { auth: true });
}

export async function apiRequestJoinDepartment(departmentId: number) {
  await apiFetch(`/departments/${departmentId}/join`, {
    method: "POST",
    auth: true,
  });
}

export async function apiModeratorHandleDeptJoinRequest(id: number, action: "approve" | "reject") {
  await apiFetch(`/moderator/departments/requests/${id}/decision`, {
    method: "POST",
    body: JSON.stringify({ action }),
    auth: true,
  });
}

