"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  getServerSession,
  getSession,
  login,
  logout,
  refresh,
  subscribe,
  type User,
} from "../lib/auth";

const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  login: typeof login;
  logout: typeof logout;
} | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const session = useSyncExternalStore(subscribe, getSession, getServerSession);

  useEffect(() => {
    void refresh().catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ ...session, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("AuthProvider is required");
  return auth;
};
