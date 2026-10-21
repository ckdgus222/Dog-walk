"use client";

import { createContext, useContext, useEffect } from "react";
import { login, logout, refresh, type User } from "../../lib/auth";
import { useAuthStore } from "../../lib/auth-store";

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: typeof login;
  logout: typeof logout;
} | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);

  useEffect(() => {
    void refresh().catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required");
  return auth;
};
