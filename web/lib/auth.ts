import { useAuthStore } from "./auth-store";

export interface User {
  id: number;
  email: string;
  nickname: string;
}

interface AuthResponse {
  accessToken: string;
  user: User;
}

let refreshPromise: Promise<User> | null = null;
let loginPromise: Promise<void> | null = null;
let loggingOut = false;

export const getAccessToken = () => useAuthStore.getState().accessToken;

export const responseError = async (
  response: Response,
): Promise<Error & { code?: string; status?: number }> => {
  const body = await response.json().catch(() => null);
  const message = body?.message;
  const error: Error & { code?: string; status?: number } = new Error(
    Array.isArray(message)
      ? message.join(" ")
      : typeof message === "string"
        ? message
        : "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
  );
  error.status = response.status;
  if (typeof body?.code === "string") error.code = body.code;
  return error;
};

export const refresh = (): Promise<User> => {
  // A refresh started during logout could answer after logout finishes and
  // restore the session, so none may start until logout is done.
  if (loggingOut) return Promise.reject(new Error("로그아웃하고 있어요."));
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const previousUserId = useAuthStore.getState().user?.id;
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw await responseError(response);
      const result: AuthResponse = await response.json();
      if (previousUserId !== undefined && previousUserId !== result.user.id) {
        window.location.reload();
        throw new Error("로그인 계정이 바뀌어 페이지를 새로고침합니다.");
      }
      useAuthStore.getState().setAuth(result.user, result.accessToken);
      return result.user;
    } catch (error) {
      useAuthStore.getState().clearAuth();
      throw error;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

export const login = (email: string, password: string): Promise<void> => {
  loginPromise = (async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw await responseError(response);
    const result: AuthResponse = await response.json();
    useAuthStore.getState().setAuth(result.user, result.accessToken);
  })().finally(() => {
    loginPromise = null;
  });
  return loginPromise;
};

export const signup = async (body: {
  email: FormDataEntryValue | null;
  password: FormDataEntryValue | null;
  nickname: FormDataEntryValue | null;
  dog: {
    name: FormDataEntryValue | null;
    breed: FormDataEntryValue | null;
    size: FormDataEntryValue | null;
    gender: FormDataEntryValue | null;
    neutered: boolean;
    birthYear: number;
    personality: FormDataEntryValue | null;
  };
}): Promise<void> => {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
};

export const logout = async () => {
  loggingOut = true;
  try {
    // Wait for in-flight login/refresh so a late response cannot revive the
    // session (or, for login, set a new cookie) after logout has finished.
    if (loginPromise) await loginPromise.catch(() => {});
    if (refreshPromise) await refreshPromise.catch(() => {});
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!response.ok) throw await responseError(response);
  } finally {
    useAuthStore.getState().clearAuth();
    loggingOut = false;
  }
};

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const requestUserId = useAuthStore.getState().user?.id;
  const headers = new Headers(init.headers);
  const accessToken = getAccessToken();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status !== 401) return response;

  const user = await refresh();
  // The original request must never run under another account.
  if (
    requestUserId !== undefined &&
    (requestUserId !== user.id ||
      requestUserId !== useAuthStore.getState().user?.id)
  ) {
    window.location.reload();
    throw new Error("로그인 계정이 바뀌어 페이지를 새로고침합니다.");
  }
  const refreshedToken = getAccessToken();
  if (!refreshedToken) throw new Error("로그인이 필요합니다.");
  headers.set("Authorization", `Bearer ${refreshedToken}`);
  return fetch(path, { ...init, headers });
};

export const apiRequest = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await apiFetch(path, init);
  if (!response.ok) throw await responseError(response);
  if (response.status === 204) return null as T;
  return response.json();
};
