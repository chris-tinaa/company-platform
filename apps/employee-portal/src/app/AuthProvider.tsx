import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "../shared/api/http";
import { useQueryClient } from "@tanstack/react-query";

export type User = {
  id: string;
  employeeId: string;
  userId: string;
  role: "HR" | "EMPLOYEE";
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (userId: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function restore(): Promise<void> {
    setLoading(true);
    try {
      const result = await api.get<{ data: { user: User } }>("/auth/me");
      setUser(result.data.data.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void restore();
    const sessionExpired = () => {
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener("attendance-session-expired", sessionExpired);
    return () =>
      window.removeEventListener("attendance-session-expired", sessionExpired);
  }, []);

  async function login(userId: string, password: string): Promise<User> {
    const result = await api.post<{ data: { user: User } }>("/auth/login", {
      user_id: userId,
      password,
    });
    queryClient.clear();
    setUser(result.data.data.user);
    return result.data.data.user;
  }

  async function logout(): Promise<void> {
    await api.post("/auth/logout");
    queryClient.clear();
    setUser(null);
  }

  const value = useMemo(
    () => ({ user, loading, login, logout, restore }),
    [user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider wajib digunakan");
  return context;
}
