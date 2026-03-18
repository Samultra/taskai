import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface LocationState {
  from?: { pathname?: string };
}

const Login = () => {
  const { signIn, user, profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState | null;

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Если пользователь уже вошёл — не показываем форму, а перекидываем в нужный кабинет
    if (authLoading) return;
    if (!user) return;
    if (profile?.role === "admin") navigate("/admin", { replace: true });
    else if (profile?.role === "moderator") navigate("/moderator", { replace: true });
    else navigate("/", { replace: true });
  }, [authLoading, user, profile?.role, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) return;
    setError(null);
    setLoading(true);
    const res = await signIn(form.email, form.password);
    setLoading(false);

    if (res.error) {
      setError(res.error);
      toast({
        title: "Ошибка входа",
        description: res.error,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Добро пожаловать!",
      description: "Вы успешно вошли в систему.",
    });

    // Если до логина пытались открыть закрытую страницу — возвращаем туда.
    // Иначе отправляем по роли.
    const from = state?.from?.pathname;
    if (from && from !== "/login" && from !== "/register") {
      navigate(from, { replace: true });
      return;
    }
    // profile может подгружаться чуть позже — поэтому выбираем безопасный дефолт
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md glass-effect shadow-card p-6 space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Вход в TaskAI</h1>
          <p className="text-sm text-muted-foreground">
            Войдите, чтобы управлять задачами и получать подсказки от ИИ.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
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
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
              required
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-gradient-ai hover:shadow-glow"
            disabled={loading}
          >
            {loading ? "Входим..." : "Войти"}
          </Button>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          Нет аккаунта?{" "}
          <Link to="/register" className="text-primary underline-offset-2 hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </Card>
    </div>
  );
};

export default Login;

