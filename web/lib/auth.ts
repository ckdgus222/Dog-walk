export interface User {
  id: number;
  email: string;
  nickname: string;
}

interface AuthResponse {
  accessToken: string;
  user: User;
}

const initialSession: { user: User | null; loading: boolean } = {
  user: null,
  loading: true,
};
let session = initialSession;
let accessToken: string | null = null;
let refreshPromise: Promise<User> | null = null;
let loginPromise: Promise<void> | null = null;
let loggingOut = false;
const listeners = new Set<() => void>();

export const getSession = () => session;
export const getAccessToken = () => accessToken;
export const getServerSession = () => initialSession;

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const setSession = (result: AuthResponse | null) => {
  accessToken = result?.accessToken ?? null;
  session = { user: result?.user ?? null, loading: false };
  listeners.forEach((listener) => listener());
};

export const responseError = async (response: Response): Promise<Error> => {
  const body = await response.json().catch(() => null);
  const message = body?.message;
  return new Error(
    Array.isArray(message)
      ? message.join(" ")
      : typeof message === "string"
        ? message
        : "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
  );
};

export const refresh = (): Promise<User> => {
  // A refresh started during logout could answer after logout finishes and
  // restore the session, so none may start until logout is done.
  if (loggingOut) return Promise.reject(new Error("로그아웃하고 있어요."));
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const previousUserId = session.user?.id;
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
      setSession(result);
      return result.user;
    } catch (error) {
      setSession(null);
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
    setSession(result);
  })().finally(() => {
    loginPromise = null;
  });
  return loginPromise;
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
    setSession(null);
    loggingOut = false;
  }
};

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const requestUserId = session.user?.id;
  const headers = new Headers(init.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status !== 401) return response;

  const user = await refresh();
  // The original request must never run under another account.
  if (
    requestUserId !== undefined &&
    (requestUserId !== user.id || requestUserId !== session.user?.id)
  ) {
    window.location.reload();
    throw new Error("로그인 계정이 바뀌어 페이지를 새로고침합니다.");
  }
  if (!accessToken) throw new Error("로그인이 필요합니다.");
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(path, { ...init, headers });
};
