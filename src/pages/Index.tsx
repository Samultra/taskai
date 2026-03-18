import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Brain, Calendar, CheckCircle2, Clock, MessageSquare, Sparkles, Star, Bell, BellOff, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import TaskCard, { Task } from "@/components/TaskCard";
import TaskForm from "@/components/TaskForm";
import AIChat from "@/components/AIChat";
import { useToast } from "@/hooks/use-toast";
import { apiCreateTask, apiDeleteTask, apiGetTasks, apiUpdateTask, apiGetDepartmentsWithMembers, apiRequestJoinDepartment } from "@/lib/api";
import { registerServiceWorker, requestPermission, startTipsScheduler, stopTipsScheduler, showNotification } from "@/lib/notifications";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");
  const [taskScope, setTaskScope] = useState<"personal" | "team">("personal");
  const [tipsEnabled, setTipsEnabled] = useState(false);
  const [departments, setDepartments] = useState<any[]>([]);
  const [joiningDeptId, setJoiningDeptId] = useState<number | null>(null);
  const [isDeptSheetOpen, setIsDeptSheetOpen] = useState(false);
  const { toast } = useToast();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const loadTasks = async () => {
    console.log('Loading tasks...', new Date().toISOString());
    try {
      const rows = await apiGetTasks();
      console.log('Tasks loaded:', rows?.length || 0);
      const mapped: Task[] = (rows ?? []).map((t: any) => ({
        id: String(t.id),
        title: t.title,
        description: t.description ?? undefined,
        completed: Boolean(t.completed),
        priority: (t.priority ?? "medium") as Task["priority"],
        category: t.category ?? "Личное",
        dueDate: t.due_date ? new Date(t.due_date) : undefined,
        createdAt: t.created_at ? new Date(t.created_at) : new Date(),
        subtasks: undefined,
        plan: undefined
      }));

      setTasks(mapped);
    } catch (err) {
      console.error('Load tasks error:', err);
      toast({ title: "Ошибка загрузки", description: err instanceof Error ? err.message : "Не удалось загрузить задачи", variant: "destructive" });
    }
  };

  useEffect(() => {
    loadTasks();
    const loadDepts = async () => {
      try {
        const res = await apiGetDepartmentsWithMembers();
        setDepartments(res.departments ?? []);
      } catch (e: any) {
        console.error("Load departments error", e);
        toast({ title: "Ошибка загрузки отделов", description: e?.message ?? "Не удалось загрузить отделы", variant: "destructive" });
      }
    };
    loadDepts();
  }, []);

  const togglePush = async () => {
    if (!tipsEnabled) {
      const granted = await requestPermission();
      if (!granted) {
        toast({ title: "Уведомления отключены", description: "Разрешите отправку уведомлений в браузере.", variant: "destructive" });
        return;
      }
      const reg = await registerServiceWorker();
      if (!reg) {
        toast({ title: "Сервис-воркер не зарегистрирован", description: "Браузер не поддерживает SW.", variant: "destructive" });
        return;
      }
      setTipsEnabled(true);
      startTipsScheduler(60);
      await showNotification("TaskAI", "Push-советы по тайм-менеджменту включены!");
    } else {
      stopTipsScheduler();
      setTipsEnabled(false);
      await showNotification("TaskAI", "Push-советы отключены");
    }
  };

  const addTask = async (taskData: Omit<Task, "id" | "completed" | "createdAt">) => {
    const payload = {
      title: taskData.title,
      description: taskData.description ?? null,
      completed: false,
      priority: taskData.priority,
      category: taskData.category,
      due_date: taskData.dueDate ? taskData.dueDate.toISOString() : null,
    };

    try {
      const created = await apiCreateTask(payload);

      const newTask: Task = {
        ...taskData,
        id: String(created?.id ?? Date.now()),
        completed: Boolean(created?.completed ?? false),
        createdAt: created?.created_at ? new Date(created.created_at) : new Date()
      };

      setTasks(prev => [newTask, ...prev]);
      toast({ title: "Задача добавлена!", description: `"${taskData.title}" успешно добавлена в список дел.` });
    } catch (error: any) {
      toast({ title: "Не удалось добавить задачу", description: error?.message ?? "Ошибка сервера", variant: "destructive" });
    }
  };

  const toggleTaskComplete = async (id: string) => {
    const existing = tasks.find(t => t.id === id);
    const newCompleted = existing ? !existing.completed : true;

    try {
      await apiUpdateTask(id, { completed: newCompleted });

      setTasks(prev => prev.map(task => task.id === id ? { ...task, completed: newCompleted } : task));
      if (existing) {
        toast({
          title: newCompleted ? "Задача выполнена!" : "Задача возобновлена",
          description: newCompleted ? `Отличная работа! "${existing.title}" завершена.` : `"${existing.title}" помечена как невыполненная.`
        });
      }
    } catch (error: any) {
      toast({ title: "Не удалось обновить задачу", description: error?.message ?? "Ошибка сервера", variant: "destructive" });
    }
  };

  const deleteTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    try {
      await apiDeleteTask(id);
      setTasks(prev => prev.filter(t => t.id !== id));
      if (task) {
        toast({ title: "Задача удалена", description: `"${task.title}" была удалена из списка.`, variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Не удалось удалить задачу", description: error?.message ?? "Ошибка сервера", variant: "destructive" });
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    console.log('Updating task:', id, updates);
    setTasks(prev => prev.map(task =>
      task.id === id ? { ...task, ...updates } : task
    ));

    try {
      const payload: any = {};
      if (updates.completed !== undefined) {
        payload.completed = updates.completed;
      }
      if (updates.priority !== undefined) {
        payload.priority = updates.priority;
      }
      if (updates.category !== undefined) {
        payload.category = updates.category;
      }
      if (updates.dueDate !== undefined) {
        payload.due_date = updates.dueDate ? updates.dueDate.toISOString() : null;
      }
      if (Object.keys(payload).length > 0) {
        await apiUpdateTask(id, payload);
      }
      if ('subtasks' in updates || 'plan' in updates) {
        toast({
          title: "Данные сохранены локально",
          description: "После добавления полей в БД данные будут сохраняться постоянно"
        });
      }
    } catch (error: any) {
      console.error('Update task error', error);
      toast({
        title: "Ошибка обновления",
        description: error?.message ?? "Не удалось сохранить изменения",
        variant: "destructive"
      });
    }
  };

  const scopeTasks = tasks.filter((task) =>
    taskScope === "personal" ? task.category !== "Команда" : task.category === "Команда"
  );

  const filteredTasks = scopeTasks.filter((task) => {
    if (filter === "pending") return !task.completed;
    if (filter === "completed") return task.completed;
    return true;
  });

  const stats = {
    total: scopeTasks.length,
    completed: scopeTasks.filter((t) => t.completed).length,
    pending: scopeTasks.filter((t) => !t.completed).length,
    highPriority: scopeTasks.filter((t) => t.priority === "high" && !t.completed).length,
  };

  const myDepartments = departments.filter((d: any) => d.is_member);

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className={`max-w-6xl mx-auto transition-all duration-300 ${isChatOpen ? "lg:mr-80 xl:mr-96" : ""}`}>
        {/* Header */}
        <header className="mb-8 animate-fade-in -mt-2">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-ai bg-clip-text text-transparent">
                TaskAI
              </h1>
              <p className="text-muted-foreground mt-2">
                Где мысль находит форму, а действие — своё время
              </p>
            </div>
            
            <div className="flex flex-col items-stretch gap-2">
              {profile && (
                <div className="flex flex-col items-end text-right text-xs text-muted-foreground">
                  <span className="font-medium">
                    {profile.email}
                  </span>
                  <span className="uppercase text-[10px] tracking-wide">
                    Роль: {profile.role}
                  </span>
                  {myDepartments.length > 0 && (
                    <span className="mt-1 text-[10px]">
                      Отделы:{" "}
                      {myDepartments
                        .map((d: any) => d.name)
                        .join(", ")}
                    </span>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                {profile && (
                  <Sheet open={isDeptSheetOpen} onOpenChange={setIsDeptSheetOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Users className="h-4 w-4 mr-1" />
                        Отделы
                        {myDepartments.length > 0 && (
                          <Badge variant="secondary" className="ml-1 text-[10px]">
                            {myDepartments.length}
                          </Badge>
                        )}
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="w-80 sm:max-w-sm overflow-y-auto">
                      <SheetHeader>
                        <SheetTitle>Отделы</SheetTitle>
                      </SheetHeader>
                      <div className="mt-6 space-y-4">
                        {departments.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Пока нет отделов.</p>
                        ) : (
                        departments.map((d: any) => {
                          const members = (d.members ?? []) as { email: string; full_name?: string | null }[];
                          const isMember = d.is_member;
                          const hasPending = d.has_pending_request;
                          const handleJoin = async () => {
                            try {
                              setJoiningDeptId(d.id);
                              await apiRequestJoinDepartment(d.id);
                              toast({
                                title: "Заявка отправлена",
                                description: `Ожидает одобрения модератора в отдел "${d.name}"`,
                              });
                              setDepartments((prev) =>
                                prev.map((x: any) =>
                                  x.id === d.id ? { ...x, has_pending_request: true } : x
                                )
                              );
                            } catch (e: any) {
                              toast({
                                title: "Не удалось отправить заявку",
                                description: e?.message ?? "Ошибка сервера",
                                variant: "destructive",
                              });
                            } finally {
                              setJoiningDeptId(null);
                            }
                          };
                          return (
                            <div
                              key={d.id}
                              className="p-3 rounded-lg border bg-card/80 text-sm space-y-2"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-semibold">{d.name}</p>
                                  {d.description && (
                                    <p className="text-xs text-muted-foreground">{d.description}</p>
                                  )}
                                </div>
                                {profile && (
                                  <>
                                    {isMember ? (
                                      <Badge variant="outline" className="text-[10px] shrink-0">
                                        Вы в отделе
                                      </Badge>
                                    ) : hasPending ? (
                                      <Badge variant="outline" className="text-[10px] shrink-0">
                                        Заявка отправлена
                                      </Badge>
                                    ) : (
                                      <Button
                                        size="sm"
                                        className="h-7 px-2 text-xs shrink-0"
                                        onClick={handleJoin}
                                        disabled={joiningDeptId === d.id}
                                      >
                                        Вступить
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Участники:</p>
                                {members.length ? (
                                  <ul className="space-y-0.5 max-h-24 overflow-auto pr-1 text-xs">
                                    {members.map((m, idx) => (
                                      <li key={idx} className="flex items-center justify-between gap-2 truncate">
                                        <span className="truncate">{m.full_name || m.email}</span>
                                        <span className="text-[10px] text-muted-foreground truncate">{m.email}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-xs text-muted-foreground">Пока нет участников.</p>
                                )}
                              </div>
                            </div>
                          );
                        })
                        )}
                      </div>
                    </SheetContent>
                  </Sheet>
                )}
                {profile?.role === "admin" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/admin")}
                  >
                    Админ-панель
                  </Button>
                )}
                {(profile?.role === "moderator" || profile?.role === "admin") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/moderator")}
                  >
                    Модерация
                  </Button>
                )}
                <Button
                  onClick={() => setIsChatOpen(true)}
                  className="bg-gradient-ai hover:shadow-glow transition-all duration-300 group"
                  size="sm"
                >
                  <Brain className="h-4 w-4 mr-1 group-hover:rotate-12 transition-transform" />
                  ИИ
                  <Sparkles className="h-3 w-3 ml-1 group-hover:scale-110 transition-transform" />
                </Button>
                <Button
                  variant={tipsEnabled ? "default" : "outline"}
                  onClick={togglePush}
                  size="sm"
                  className={tipsEnabled ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                >
                  {tipsEnabled ? <BellOff className="h-4 w-4 mr-1" /> : <Bell className="h-4 w-4 mr-1" />}
                  Push
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await signOut();
                    navigate("/login", { replace: true });
                  }}
                >
                  Выйти
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="glass-effect shadow-card p-4 hover:shadow-floating transition-all">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Всего задач</p>
              </div>
            </div>
          </Card>

          <Card className="glass-effect shadow-card p-4 hover:shadow-floating transition-all">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-success">{stats.completed}</p>
                <p className="text-sm text-muted-foreground">Выполнено</p>
              </div>
            </div>
          </Card>

          <Card className="glass-effect shadow-card p-4 hover:shadow-floating transition-all">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-warning">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">В работе</p>
              </div>
            </div>
          </Card>

          <Card className="glass-effect shadow-card p-4 hover:shadow-floating transition-all">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Star className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{stats.highPriority}</p>
                <p className="text-sm text-muted-foreground">Приоритетные</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Task Form */}
        <div className="mb-8">
          <TaskForm
            onAddTask={addTask}
            defaultExpanded
            taskScope={taskScope}
            onTaskScopeChange={setTaskScope}
          />
        </div>

        {/* Tasks Section */}
        <Card className="glass-effect shadow-card">
          <div className="p-6">
            <Tabs value={filter} onValueChange={(value: any) => setFilter(value)}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex flex-col gap-2">
                  <h2 className="text-2xl font-semibold">
                    {taskScope === "personal" ? "Личные задачи" : "Командные задачи"}
                  </h2>
                  <div className="inline-flex gap-2">
                    <Button
                      type="button"
                      variant={taskScope === "personal" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTaskScope("personal")}
                    >
                      Личные
                    </Button>
                    <Button
                      type="button"
                      variant={taskScope === "team" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setTaskScope("team")}
                    >
                      Команда
                    </Button>
                  </div>
                </div>
                <div className="w-full sm:w-auto overflow-x-auto">
                  <TabsList className="grid grid-cols-3 sm:inline-flex min-w-[360px]">
                    <TabsTrigger value="all">Все ({stats.total})</TabsTrigger>
                    <TabsTrigger value="pending">Активные ({stats.pending})</TabsTrigger>
                    <TabsTrigger value="completed">Готовые ({stats.completed})</TabsTrigger>
                  </TabsList>
                </div>
              </div>

              <TabsContent value={filter} className="space-y-4">
                {filteredTasks.length > 0 ? (
                  filteredTasks.map((task, index) => (
                    <div 
                      key={task.id}
                      style={{ animationDelay: `${index * 100}ms` }}
                    >
                      <TaskCard
                        task={task}
                        onToggleComplete={toggleTaskComplete}
                        onDelete={deleteTask}
                        onUpdateTask={updateTask}
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="text-lg mb-2">
                      {filter === "completed" ? "Нет выполненных задач" :
                       filter === "pending" ? "Нет активных задач" :
                       "Пока нет задач"}
                    </p>
                    <p className="text-sm">
                      {filter === "all" ? "Добавьте первую задачу выше" : "Попробуйте изменить фильтр"}
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </Card>

        {/* Floating Chat Button for Mobile */}
        {!isChatOpen && (
          <Button
            onClick={() => setIsChatOpen(true)}
            className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-ai shadow-floating hover:shadow-glow transition-all duration-300 lg:hidden z-40"
            size="lg"
          >
            <MessageSquare className="h-6 w-6" />
          </Button>
        )}
      </div>

      {/* AI Chat Sidebar */}
      <AIChat isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
    </div>
  );
};

export default Index;