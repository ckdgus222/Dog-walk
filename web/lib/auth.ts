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

type ApiError = Error & { code?: string; status?: number };

type FormValue = FormDataEntryValue | null;

interface SignupBody {
  email: FormValue;
  password: FormValue;
  nickname: FormValue;
  dog: {
    name: FormValue;
    breed: FormValue;
    size: FormValue;
    gender: FormValue;
    neutered: boolean;
    birthYear: number;
    personality: FormValue;
  };
}

let refreshPromise: Promise<User> | null = null;
let loginPromise: Promise<boolean> | null = null;
const passwordChanges = new Set<Promise<unknown>>();
let loggingOut = false;

export const getAccessToken = () => useAuthStore.getState().accessToken;

export const responseError = async (response: Response): Promise<ApiError> => {
  const body = await response.json().catch(() => null);
  let message = "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
  if (Array.isArray(body?.message)) message = body.message.join(" ");
  else if (typeof body?.message === "string") message = body.message;

  const error: ApiError = new Error(message);
  error.status = response.status;
  if (typeof body?.code === "string") error.code = body.code;
  return error;
};

const postJson = async (path: string, body: unknown = {}) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response);
  return response;
};

const reloadForAccountChange = (): never => {
  window.location.reload();
  throw new Error("로그인 계정이 바뀌어 페이지를 새로고침합니다.");
};

export const refresh = (): Promise<User> => {
  // A refresh started during logout could answer after logout finishes and
  // restore the session, so none may start until logout is done.
  if (loggingOut) return Promise.reject(new Error("로그아웃하고 있어요."));
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const previousUserId = useAuthStore.getState().user?.id;
    try {
      const response = await postJson("/api/auth/refresh");
      const { user, accessToken }: AuthResponse = await response.json();
      if (previousUserId !== undefined && previousUserId !== user.id) {
        reloadForAccountChange();
      }
      useAuthStore.getState().setAuth(user, accessToken);
      return user;
    } catch (error) {
      useAuthStore.getState().clearAuth();
      throw error;
    }
  })().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
};

export const login = (
  email: string,
  password: string,
  canNavigate: () => boolean = () => true,
): Promise<boolean> => {
  // Logout waits only for loginPromise, so a second login would hide the
  // first one's late response from it and let that response log back in.
  if (loggingOut) return Promise.reject(new Error("로그아웃하고 있어요."));
  if (loginPromise) return Promise.reject(new Error("로그인하고 있어요."));

  loginPromise = (async () => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw await responseError(response);
    const { user, accessToken }: AuthResponse = await response.json();
    // Saving auth remounts the forms, so check departure before saving it.
    const shouldNavigate = canNavigate();
    useAuthStore.getState().setAuth(user, accessToken);
    useAuthStore.setState({ welcomeNickname: user.nickname });
    return shouldNavigate;
  })().finally(() => {
    loginPromise = null;
  });
  return loginPromise;
};

// Shows a saved nickname. A token refresh started before the save answers
// with the old nickname and replaces the whole user, so wait for it first.
export const applySavedUser = async (user: User) => {
  if (refreshPromise) await refreshPromise.catch(() => {});
  useAuthStore.getState().updateUser(user);
};

export const signup = async (body: SignupBody): Promise<void> => {
  await postJson("/api/auth/signup", body);
};

export const changePassword = (body: {
  currentPassword: string;
  newPassword: string;
}): Promise<User> => {
  if (loggingOut) return Promise.reject(new Error("로그아웃하고 있어요."));

  const pending = apiRequest<User>("/api/users/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).finally(() => {
    passwordChanges.delete(pending);
  });
  passwordChanges.add(pending);
  return pending;
};

export const logout = async () => {
  loggingOut = true;
  try {
    // Wait for in-flight login/refresh so a late response cannot revive the
    // session (or, for login, set a new cookie) after logout has finished.
    if (loginPromise) await loginPromise.catch(() => {});
    if (refreshPromise) await refreshPromise.catch(() => {});
    // Password changes replace the refresh cookie, so logout needs their
    // responses before it can invalidate the latest token.
    await Promise.allSettled([...passwordChanges]);
    await postJson("/api/auth/logout");
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
  const accountChanged =
    requestUserId !== undefined &&
    (requestUserId !== user.id ||
      requestUserId !== useAuthStore.getState().user?.id);
  if (accountChanged) reloadForAccountChange();

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
