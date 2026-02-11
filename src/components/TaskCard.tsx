import { useState } from "react";
import { Check, Clock, Star, Trash2, Calendar, ListChecks, CalendarClock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { makeSubtasks, buildDayPlan } from "@/lib/ai";

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  category: string;
  dueDate?: Date;
  createdAt: Date;
  subtasks?: string;
  plan?: string;
}

interface TaskCardProps {
  task: Task;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateTask: (id: string, updates: Partial<Task>) => void;
}

const priorityColors = {
  low: "border-success text-black",
  medium: "border-warning text-black", 
  high: "border-destructive text-black"
};

const stripCodeFence = (text?: string) => {
  if (!text) return text;
  return text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```\s*$/i, '');
};

const extractFirstArrayJson = (text: string): any[] | null => {
  // Ищем первый JSON-массив в тексте
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    const candidate = text.slice(start, end + 1);
    try {
      const parsed = JSON.parse(candidate);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
};

const parseMaybeArray = (raw?: string, key?: string): any[] | null => {
  if (!raw) return null;
  const cleaned = stripCodeFence(raw).trim();
  // 1) Чистый массив
  try {
    const data = JSON.parse(cleaned);
    if (Array.isArray(data)) return data;
    if (key && data && Array.isArray((data as any)[key])) return (data as any)[key];
  } catch {}
  // 2) Извлечь массив из текста (с описанием до/после)
  const arrayFound = extractFirstArrayJson(cleaned);
  if (arrayFound) return arrayFound;
  return null;
};

const TaskCard = ({ task, onToggleComplete, onDelete, onUpdateTask }: TaskCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const handleSubtasks = async () => {
    try {
      setLoading('subs');
      const res = await makeSubtasks(task.title, task.description);
      // сохраняем очищенный текст
      const cleaned = stripCodeFence(res);
      const arr = parseMaybeArray(cleaned, 'subtasks');
      const toSave = arr ? JSON.stringify(arr) : cleaned;
      onUpdateTask(task.id, { subtasks: toSave });
      toast({ title: 'Подзадачи созданы', description: 'Подзадачи сохранены в задаче. Нажмите "Просмотр" для просмотра.' });
    } catch (e: any) {
      toast({ title: 'Ошибка подзадач', description: e.message, variant: 'destructive' });
    } finally { setLoading(null); }
  };

  const handlePlan = async () => {
    try {
      setLoading('plan');
      const estimate = task.priority === 'high' ? 90 : task.priority === 'medium' ? 60 : 30;
      const res = await buildDayPlan([{ title: task.title, priority: task.priority, estimateMinutes: estimate }]);
      const cleaned = stripCodeFence(res);
      const arr = parseMaybeArray(cleaned, 'plan');
      const toSave = arr ? JSON.stringify(arr) : cleaned;
      onUpdateTask(task.id, { plan: toSave });
      toast({ title: 'План создан', description: 'План сохранён в задаче. Нажмите "Просмотр" для просмотра.' });
    } catch (e: any) {
      toast({ title: 'Ошибка плана', description: e.message, variant: 'destructive' });
    } finally { setLoading(null); }
  };

  const hasSubtasks = task.subtasks && task.subtasks.trim() !== '';
  const hasPlan = task.plan && task.plan.trim() !== '';

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden transition-all duration-300 ease-smooth",
        "glass-effect shadow-card hover:shadow-floating",
        "animate-slide-up",
        task.completed && "opacity-75 bg-muted/50"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="p-4 space-y-3">
        {/* Header with title and actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-1">
            <h3 className={cn(
              "font-semibold text-foreground transition-all",
              task.completed && "line-through text-muted-foreground"
            )}>
              {task.title}
            </h3>
            {task.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {task.description}
              </p>
            )}
          </div>
          
          <div className={cn(
            "flex items-center gap-1 opacity-0 transition-opacity",
            isHovered && "opacity-100"
          )}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleComplete(task.id)}
              className="h-8 w-8 p-0 hover:bg-success/10 hover:text-success"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm" 
              onClick={() => onDelete(task.id)}
              className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Meta info */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {task.category}
            </Badge>
            <Badge 
              variant="outline" 
              className={cn("text-xs", priorityColors[task.priority])}
            >
              <Star className="h-3 w-3 mr-1" />
              {task.priority}
            </Badge>
          </div>
          
          {task.dueDate && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {task.dueDate.toLocaleDateString('ru-RU', { 
                day: 'numeric', 
                month: 'short' 
              })}
            </div>
          )}
        </div>

        {/* AI actions */}
        <div className="flex gap-2 pt-1 flex-col sm:flex-row">
          <Button variant="outline" size="sm" onClick={handleSubtasks} disabled={loading==='subs'} className="w-full sm:w-auto">
            <ListChecks className="h-4 w-4 mr-1" /> Подзадачи
          </Button>
          <Button variant="outline" size="sm" onClick={handlePlan} disabled={loading==='plan'} className="w-full sm:w-auto">
            <CalendarClock className="h-4 w-4 mr-1" /> План
          </Button>
          {(hasSubtasks || hasPlan) && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  <Eye className="h-4 w-4 mr-1" /> Просмотр
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-4xl max-w-[96vw] w-[96vw] sm:w-auto">
                <DialogHeader>
                  <DialogTitle>{task.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-6">
                  {hasSubtasks && (
                    <div>
                      <h3 className="font-semibold mb-3">Подзадачи</h3>
                      <div className="bg-muted p-4 rounded text-sm overflow-auto max-h-[50vh] sm:max-h-[60vh]">
                        {(() => {
                          const arr = parseMaybeArray(task.subtasks as string, 'subtasks');
                          if (arr) {
                            return (
                              <ol className="list-decimal pl-5 space-y-2">
                                {arr.map((it: any, idx: number) => (
                                  <li key={idx} className="leading-relaxed">
                                    <span className="font-medium">{it.title || `Шаг ${idx + 1}`}</span>
                                    {it.time_estimate_minutes || it.estimate || it.time ? (
                                      <span className="text-muted-foreground"> — {it.time_estimate_minutes || it.estimate || `${it.time} мин.`}</span>
                                    ) : null}
                                    {it.note ? <div className="text-muted-foreground mt-1">{it.note}</div> : null}
                                  </li>
                                ))}
                              </ol>
                            );
                          }
                          return <pre className="whitespace-pre-wrap">{stripCodeFence(task.subtasks)}</pre>;
                        })()}
                      </div>
                    </div>
                  )}
                  {hasPlan && (
                    <div>
                      <h3 className="font-semibold mb-3">План</h3>
                      <div className="bg-muted p-4 rounded text-sm overflow-auto max-h-[50vh] sm:max-h-[60vh]">
                        {(() => {
                          const arr = parseMaybeArray(task.plan as string, 'plan');
                          if (arr) {
                            return (
                              <ul className="space-y-2">
                                {arr.map((b: any, idx: number) => (
                                  <li key={idx} className="leading-relaxed">
                                    <span className="inline-flex items-center gap-2 flex-wrap">
                                      <span className="px-2 py-0.5 rounded bg-background border text-xs font-mono">{b.time || ""}</span>
                                      <span className="font-medium break-words">{b.title || b.activity || "Задача"}</span>
                                    </span>
                                    {b.note ? <div className="text-muted-foreground mt-1 break-words">{b.note}</div> : null}
                                  </li>
                                ))}
                              </ul>
                            );
                          }
                          return <pre className="whitespace-pre-wrap">{stripCodeFence(task.plan)}</pre>;
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Completion indicator */}
        {task.completed && (
          <div className="absolute inset-0 bg-gradient-to-r from-success/10 to-transparent pointer-events-none" />
        )}
      </div>
    </Card>
  );
};

export default TaskCard;