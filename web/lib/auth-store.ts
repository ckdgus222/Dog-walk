import { create } from "zustand";
import type { User } from "./auth";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  setAuth: (user: User, accessToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  loading: true,
  setAuth: (user, accessToken) => set({ user, accessToken, loading: false }),
  clearAuth: () => set({ user: null, accessToken: null, loading: false }),
}));
