import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiProjectList, apiGetTasks, apiUpdateTask } from "@/lib/api";
import { KanbanBoard, type KanbanTaskItem } from "@/components/KanbanBoard";
import { normalizeKanbanStatus, type KanbanColumnId } from "@/lib/kanban";
import { FolderKanban, ArrowLeft, Calendar, Users } from "lucide-react";

interface ProjectItem {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  color: string | null;
  owner_profile_id: string | null;
  is_archived: boolean;
  created_at: string;
}

const ProjectsPage = () => {
  const { toast } = useToast();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [teamTasks, setTeamTasks] = useState<KanbanTaskItem[]>([]);
  const [teamLoading, setTeamLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiProjectList();
      setProjects((data.projects ?? []) as ProjectItem[]);
    } catch (e: any) {
      toast({
        title: "Не удалось загрузить проекты",
        description: e?.message ?? "Ошибка сервера",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadTeamTasks = useCallback(async () => {
    setTeamLoading(true);
    try {
      const rows = await apiGetTasks();
      const team = (rows ?? []).filter((t: any) => t.category === "Команда");
      const mapped: KanbanTaskItem[] = team.map((t: any) => ({
        id: String(t.id),
        title: t.title,
        description: t.description ?? null,
        documentation: t.documentation ?? null,
        status: normalizeKanbanStatus(t.status),
        priority: t.priority ?? "medium",
        assigneeLabel: t.owner_email ? `Автор: ${t.owner_email}` : null,
        readOnly: t.can_edit === false,
      }));
      setTeamTasks(mapped);
    } catch (e: any) {
      toast({
        title: "Не удалось загрузить командные задачи",
        description: e?.message ?? "Ошибка сервера",
        variant: "destructive",
      });
    } finally {
      setTeamLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    loadTeamTasks();
  }, [loadTeamTasks]);

  const refreshAll = async () => {
    await load();
    await loadTeamTasks();
  };

  const onTeamStatusChange = useCallback(
    async (taskId: string | number, status: KanbanColumnId) => {
      const id = String(taskId);
      const row = teamTasks.find((t) => String(t.id) === id);
      if (row?.readOnly) {
        toast({ title: "Нет прав менять эту задачу", variant: "destructive" });
        return;
      }
      try {
        await apiUpdateTask(id, { status });
        setTeamTasks((prev) => prev.map((t) => (String(t.id) === id ? { ...t, status } : t)));
      } catch (e: any) {
        toast({ title: "Не удалось обновить статус", description: e?.message ?? "", variant: "destructive" });
        await loadTeamTasks();
      }
    },
    [teamTasks, toast, loadTeamTasks],
  );

  const onTeamSaveDocumentation = useCallback(
    async (taskId: string | number, documentation: string | null) => {
      const id = String(taskId);
      const row = teamTasks.find((t) => String(t.id) === id);
      if (row?.readOnly) {
        toast({ title: "Нет прав редактировать документацию", variant: "destructive" });
        return;
      }
      try {
        await apiUpdateTask(id, { documentation });
        setTeamTasks((prev) => prev.map((t) => (String(t.id) === id ? { ...t, documentation } : t)));
        toast({ title: "Документация сохранена" });
      } catch (e: any) {
        toast({ title: "Ошибка сохранения", description: e?.message ?? "", variant: "destructive" });
      }
    },
    [teamTasks, toast],
  );

  const visible = showArchived ? projects : projects.filter((p) => !p.is_archived);

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-[min(100%,1820px)] mx-auto space-y-8 px-0 sm:px-1">
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-2">
            <Button asChild variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-1" />
                На главную
              </Link>
            </Button>
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <FolderKanban className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Проекты</h1>
                <p className="text-muted-foreground text-sm mt-0.5">
                  Проекты, где вы владелец, участник команды или состоите в отделе, привязанном к проекту.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant={showArchived ? "secondary" : "outline"} size="sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Скрыть архив" : "Показать архив"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loading || teamLoading}>
              Обновить
            </Button>
          </div>
        </header>

        {loading ? (
          <p className="text-muted-foreground">Загрузка…</p>
        ) : visible.length === 0 ? (
          <Card className="p-10 text-center border-dashed">
            <p className="text-muted-foreground mb-2">
              {projects.length === 0
                ? "Нет доступных проектов: нужна роль участника проекта или вступление в отдел, к которому админ привязал проект (вкладка «Проекты» — «Детали»)."
                : "Нет активных проектов. Включите показ архива или создайте новый в админ-панели."}
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visible.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="block group">
                <Card className="p-5 h-full glass-effect shadow-card border border-border/80 hover:border-primary/40 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {p.color && (
                        <span className="h-3 w-3 rounded-full border shrink-0" style={{ backgroundColor: p.color }} />
                      )}
                      <h2 className="font-semibold text-lg truncate group-hover:text-primary transition-colors">
                        {p.name}
                      </h2>
                    </div>
                    {p.is_archived && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        Архив
                      </Badge>
                    )}
                  </div>
                  {p.code && (
                    <Badge variant="secondary" className="text-[10px] mb-2">
                      {p.code}
                    </Badge>
                  )}
                  {p.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{p.description}</p>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {p.created_at ? new Date(p.created_at).toLocaleDateString("ru-RU") : "—"}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <section className="space-y-4 pt-4 border-t border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Командные задачи</h2>
                <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
                  Те же задачи, что на главной во вкладке «Команда» (категория «Команда», общие отделы). Канбан и документация — как у задач проекта.
                </p>
              </div>
            </div>
          </div>

          {teamLoading ? (
            <p className="text-muted-foreground text-sm">Загрузка командных задач…</p>
          ) : teamTasks.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <p className="text-muted-foreground text-sm">
                Нет командных задач. Создайте задачу с категорией «Команда» на главной странице (вкладка «Команда»).
              </p>
            </Card>
          ) : (
            <Card className="p-4 glass-effect shadow-card border border-border/80">
              <KanbanBoard
                wide
                tasks={teamTasks}
                onStatusChange={onTeamStatusChange}
                onSaveDocumentation={onTeamSaveDocumentation}
              />
            </Card>
          )}
        </section>
      </div>
    </div>
  );
};

export default ProjectsPage;
