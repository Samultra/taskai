import { useState } from "react";
import { Plus, Calendar, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Task } from "./TaskCard";

interface TaskFormProps {
  onAddTask: (task: Omit<Task, "id" | "completed" | "createdAt">) => void;
  defaultExpanded?: boolean;
  /** Куда добавлять задачу: "personal" = Личные, "team" = Команда */
  taskScope?: "personal" | "team";
  onTaskScopeChange?: (scope: "personal" | "team") => void;
}

const categories = [
  "Личное",
  "Работа",
  "Команда",
  "Здоровье",
  "Обучение",
  "Покупки",
  "Дом",
  "Творчество",
];

const TaskForm = ({ onAddTask, defaultExpanded, taskScope = "personal", onTaskScopeChange }: TaskFormProps) => {
  const [isExpanded, setIsExpanded] = useState(!!defaultExpanded);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high",
    category: "Личное",
    dueDate: ""
  });

  const scopeCategory = taskScope === "team" ? "Команда" : "Личное";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) return;

    onAddTask({
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      priority: formData.priority,
      category: scopeCategory,
      dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined
    });

    // Reset form
    setFormData({
      title: "",
      description: "",
      priority: "medium",
      category: "Личное",
      dueDate: ""
    });
    setIsExpanded(false);
  };

  const handleQuickAdd = () => {
    if (!formData.title.trim()) {
      setIsExpanded(true);
      return;
    }
    handleSubmit(new Event('submit') as any);
  };

  return (
    <Card className="glass-effect shadow-card hover:shadow-floating transition-all duration-300">
      <div className="p-4">
        {!isExpanded ? (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                variant={taskScope === "personal" ? "default" : "outline"}
                size="sm"
                onClick={() => onTaskScopeChange?.("personal")}
              >
                Личные
              </Button>
              <Button
                type="button"
                variant={taskScope === "team" ? "default" : "outline"}
                size="sm"
                onClick={() => onTaskScopeChange?.("team")}
              >
                Команда
              </Button>
            </div>
            <Input
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Добавить новую задачу..."
              className="flex-1 min-w-0"
              onFocus={() => setIsExpanded(true)}
              onKeyDown={(e) => e.key === "Enter" && handleQuickAdd()}
            />
            <Button 
              onClick={handleQuickAdd}
              className="px-3 bg-gradient-ai hover:shadow-glow transition-all"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 animate-slide-up">
            <div className="space-y-2">
              <Label>Куда добавить задачу</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={taskScope === "personal" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onTaskScopeChange?.("personal")}
                >
                  Личные
                </Button>
                <Button
                  type="button"
                  variant={taskScope === "team" ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => onTaskScopeChange?.("team")}
                >
                  Команда
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-title">Название задачи</Label>
              <Input
                id="task-title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Что нужно сделать?"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-description">Описание (опционально)</Label>
              <Textarea
                id="task-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Дополнительные детали..."
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Приоритет</Label>
                <Select 
                  value={formData.priority} 
                  onValueChange={(value: "low" | "medium" | "high") => 
                    setFormData(prev => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3 text-success" />
                        Низкий
                      </div>
                    </SelectItem>
                    <SelectItem value="medium">
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3 text-warning" />
                        Средний
                      </div>
                    </SelectItem>
                    <SelectItem value="high">
                      <div className="flex items-center gap-2">
                        <Star className="h-3 w-3 text-destructive" />
                        Высокий
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Категория</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="due-date">Срок выполнения</Label>
              <Input
                id="due-date"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" className="flex-1 bg-gradient-ai hover:shadow-glow">
                <Plus className="h-4 w-4 mr-2" />
                Добавить задачу
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsExpanded(false)}
              >
                Отмена
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
};

export default TaskForm;