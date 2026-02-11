import { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";

interface ProtectedRouteProps {
  children: ReactElement;
  requiredRole?: AppRole | AppRole[];
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, profile, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <p>Загрузка...</p>
        </Card>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    // если роль не подходит — отправляем на главную
    return <Navigate to="/" replace />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <p>Профиль не найден. Попробуйте выйти и войти снова.</p>
        </Card>
      </div>
    );
  }

  return children;
};

