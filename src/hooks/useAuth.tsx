import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

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
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (params: SignUpParams) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole | AppRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const fetchProfile = async (user: User): Promise<Profile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role, is_blocked, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Failed to load profile", error);
    return null;
  }

  if (!data) {
    // если профиля нет - создаём базовый
    const { data: inserted, error: insertError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email ?? "",
        full_name: user.user_metadata?.full_name ?? null,
        role: "user",
      })
      .select("id, email, full_name, role, is_blocked, created_at")
      .single();

    if (insertError) {
      console.error("Failed to create default profile", insertError);
      return null;
    }

    return inserted as Profile;
  }

  return data as Profile;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const currentUser = session?.user ?? null;
      setUser(currentUser ?? null);

      if (currentUser) {
        const prof = await fetchProfile(currentUser);
        setProfile(prof);
      } else {
        setProfile(null);
      }

      setLoading(false);
    };

    init();

    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        const prof = await fetchProfile(currentUser);
        setProfile(prof);
      } else {
        setProfile(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        console.error("Sign in error", error);
        return { error: error.message };
      }
      const authUser = data.user;
      if (authUser) {
        const prof = await fetchProfile(authUser);
        if (prof?.is_blocked) {
          // Заблокированный пользователь: выходим сразу
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
          return { error: "Ваш аккаунт заблокирован администратором." };
        }
        setProfile(prof);
      }
      return {};
    } finally {
      setLoading(false);
    }
  };

  const signUp = async ({ email, password, fullName, requestedRole }: SignUpParams) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        console.error("Sign up error", error);
        return { error: error.message };
      }

      const authUser = data.user;
      if (authUser) {
        // создаём профиль с базовой ролью user, но НЕ затираем уже повышенные роли
        const { data: existingProfile, error: existingError } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("id", authUser.id)
          .maybeSingle();

        if (existingError) {
          console.error("Profile lookup error on sign up", existingError);
        }

        let profileError = null;
        if (!existingProfile) {
          const { error } = await supabase.from("profiles").insert({
            id: authUser.id,
            email,
            full_name: fullName ?? null,
            role: "user",
          });
          profileError = error;
        } else {
          const { error } = await supabase
            .from("profiles")
            .update({
              email,
              full_name: fullName ?? null,
            })
            .eq("id", authUser.id);
          profileError = error;
        }

        if (profileError) {
          console.error("Profile upsert error", profileError);
        }

        // если запрошена более высокая роль — создаём заявку
        if (requestedRole && requestedRole !== "user") {
          const { error: rrError } = await supabase.from("registration_requests").insert({
            email,
            full_name: fullName ?? null,
            role_requested: requestedRole,
          });

          if (rrError) {
            console.error("Registration request error", rrError);
          }
        }

        const prof = await fetchProfile(authUser);
        setProfile(prof);
      }

      return {};
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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

