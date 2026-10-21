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
const listeners = new Set<() => void>();

export const getSession = () => session;
export const getServerSession = () => initialSession;

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setSession(result: AuthResponse | null) {
  accessToken = result?.accessToken ?? null;
  session = { user: result?.user ?? null, loading: false };
  listeners.forEach((listener) => listener());
}

export async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => null);
  const message = body?.message;
  return new Error(
    Array.isArray(message)
      ? message.join(" ")
      : typeof message === "string"
        ? message
        : "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
  );
}

export function refresh(): Promise<User> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = navigator.locks
    .request("auth-session", async () => {
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
    })
    // TypeScript types locks.request() as Promise<Promise<User>>; this unwraps it.
    .then((user) => user)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export async function login(email: string, password: string) {
  return navigator.locks.request("auth-session", async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw await responseError(response);
    const result: AuthResponse = await response.json();
    setSession(result);
  });
}

export async function logout() {
  return navigator.locks.request("auth-session", async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw await responseError(response);
    } finally {
      setSession(null);
    }
  });
}

export async function apiFetch(path: string, init: RequestInit = {}) {
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
}
