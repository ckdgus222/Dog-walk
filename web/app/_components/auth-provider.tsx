"use client";

import { useEffect } from "react";
import { login, logout, refresh } from "../../lib/auth";
import { useAuthStore } from "../../lib/auth-store";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  useEffect(() => {
    void refresh().catch(() => {});
  }, []);

  return children;
};

export const useAuth = () => {
  const user = useAuthStore((state) => state.user);
  const loading = useAuthStore((state) => state.loading);
  return { user, loading, login, logout };
};
