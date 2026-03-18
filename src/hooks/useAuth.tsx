import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiGetCurrentProfile, apiSignIn, apiSignOut, apiSignUp, type ApiProfile } from "@/lib/api";

export type AppRole = "user" | "moderator" | "admin";

export interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  role: AppRole;
  is_blocked?: boolean;
  created_at?: string;
}

interface SignUpParams {
  email: string;
  password: string;
  fullName?: string;
  requestedRole?: AppRole;
}

interface AuthContextValue {
  user: ApiProfile | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (params: SignUpParams) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole | AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<ApiProfile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const current = await apiGetCurrentProfile();
        setUser(current);
        setProfile(current);
      } catch (err) {
        console.error("Auth init error", err);
        setUser(null);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const profile = await apiSignIn(email, password);
      if (profile.is_blocked) {
        await apiSignOut();
        setUser(null);
        setProfile(null);
        return { error: "Ваш аккаунт заблокирован администратором." };
      }
      setUser(profile);
      setProfile(profile);
      return {};
    } catch (err: any) {
      const msg = err?.message || "Ошибка входа";
      if (msg.includes("Invalid credentials") || msg.includes("Invalid")) {
        return { error: "Неверный email или пароль. Проверьте данные и попробуйте снова." };
      }
      if (msg.includes("404") || msg.includes("not found")) {
        return { error: "Пользователь не найден. Проверьте email или зарегистрируйтесь." };
      }
      return { error: msg };
    } finally {
      setLoading(false);
    }
  };

  const signUp = async ({ email, password, fullName, requestedRole }: SignUpParams) => {
    setLoading(true);
    try {
      const profile = await apiSignUp({ email, password, fullName, requestedRole });
      setUser(profile);
      setProfile(profile);
      return {};
    } catch (err: any) {
      const msg = err?.message || "Ошибка регистрации";
      if (msg.includes("already exists") || msg.includes("уже")) {
        return { error: "Пользователь с таким email уже существует. Войдите или используйте другой email." };
      }
      if (msg.includes("Email") && msg.includes("required")) {
        return { error: "Укажите email и пароль." };
      }
      return { error: msg };
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await apiSignOut();
    setUser(null);
    setProfile(null);
  };

  const hasRole = (role: AppRole | AppRole[]) => {
    if (!profile) return false;
    const roles = Array.isArray(role) ? role : [role];
    return roles.includes(profile.role);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
};

