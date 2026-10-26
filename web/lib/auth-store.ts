import { create } from "zustand";
import type { User } from "./auth";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  setAuth: (user: User, accessToken: string) => void;
  // A saved profile for the logged-in account; the token stays.
  updateUser: (user: User) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  loading: true,
  setAuth: (user, accessToken) => set({ user, accessToken, loading: false }),
  // A save that answers after logout or an account change is dropped.
  updateUser: (user) =>
    set((state) => (state.user?.id === user.id ? { user } : state)),
  clearAuth: () => set({ user: null, accessToken: null, loading: false }),
}));
