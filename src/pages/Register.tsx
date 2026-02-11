import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth, AppRole } from "@/hooks/useAuth";

const Register = () => {
  const { signUp } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "user" as AppRole,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) return;
    setLoading(true);
    const res = await signUp({
      email: form.email,
      password: form.password,
      fullName: form.fullName,
      requestedRole: form.role,
    });
    setLoading(false);

    if (res.error) {
      toast({
        title: "Ошибка регистрации",
        description: res.error,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Регистрация успешна",
      description:
        form.role === "user"
          ? "Вы можете сразу войти в систему."
          : "Ваш запрос на повышенную роль отправлен модератору/админу.",
    });

    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md glass-effect shadow-card p-6 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Регистрация в TaskAI</h1>
          <p className="text-sm text-muted-foreground">
            Создайте аккаунт, чтобы планировать задачи с помощью ИИ.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Имя</Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
              placeholder="Как к вам обращаться?"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Роль</Label>
            <Select
              value={form.role}
              onValueChange={(value: AppRole) => setForm((prev) => ({ ...prev, role: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Обычный пользователь</SelectItem>
                <SelectItem value="moderator">Модератор (по заявке)</SelectItem>
                <SelectItem value="admin">Администратор (по заявке)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Повышенные роли требуют одобрения модератора или администратора.
            </p>
          </div>

          <Button type="submit" className="w-full bg-gradient-ai hover:shadow-glow" disabled={loading}>
            {loading ? "Регистрируем..." : "Зарегистрироваться"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          Уже есть аккаунт?{" "}
          <Link to="/login" className="text-primary underline-offset-2 hover:underline">
            Войти
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default Register;

