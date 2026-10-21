import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accountA = { id: 1, email: "a@example.com", nickname: "보호자A" };
const accountB = { id: 2, email: "b@example.com", nickname: "보호자B" };

const authResponse = (user = accountA, accessToken = "access-token") => {
  return Response.json({ user, accessToken });
};

describe("Browser auth client", () => {
  let client: typeof import("./auth");
  let useAuthStore: typeof import("./auth-store")["useAuthStore"];
  const fetchMock = vi.fn<typeof fetch>();
  const reload = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    reload.mockReset();
    vi.stubGlobal("window", { location: { reload } });
    vi.stubGlobal("fetch", fetchMock);
    client = await import("./auth");
    ({ useAuthStore } = await import("./auth-store"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts without a user or token while loading the session", () => {
    const { user, accessToken, loading } = useAuthStore.getState();
    expect({ user, accessToken, loading }).toEqual({
      user: null,
      accessToken: null,
      loading: true,
    });
  });

  it("retries multipart data without setting Content-Type", async () => {
    fetchMock.mockResolvedValueOnce(authResponse(accountA, "old-token"));
    await client.login(accountA.email, "password123");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(authResponse(accountA, "new-token"));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const body = new FormData();
    body.set("dog", JSON.stringify({ name: "보리" }));
    body.set(
      "photo",
      new Blob(["image bytes"], { type: "image/webp" }),
      "dog.webp",
    );
    const response = await client.apiFetch("/api/dogs", {
      method: "POST",
      body,
    });
    expect(response.status).toBe(201);
    const uploads = fetchMock.mock.calls.filter(
      ([path]) => path === "/api/dogs",
    );
    expect(uploads).toHaveLength(2);
    for (const [, options] of uploads) {
      expect(options?.body).toBe(body);
      expect(new Headers(options?.headers).has("Content-Type")).toBe(false);
    }
    expect(new Headers(uploads[1][1]?.headers).get("Authorization")).toBe(
      "Bearer new-token",
    );
  });

  it("shares one refresh promise within a tab", async () => {
    fetchMock.mockResolvedValue(authResponse());
    const first = client.refresh();
    const second = client.refresh();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual(accountA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { user, loading } = useAuthStore.getState();
    expect({ user, loading }).toEqual({ user: accountA, loading: false });
  });

  it.each([200, 401])(
    "waits for refresh (%s) before logout and never restores the logged out session",
    async (status) => {
      let releaseRefresh!: (response: Response) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseRefresh = resolve;
          }),
      );
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
      const refreshing = client.refresh();
      const loggingOut = client.logout();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const refreshResult = expect(refreshing);
      const refreshAssertion =
        status === 200
          ? refreshResult.resolves.toEqual(accountA)
          : refreshResult.rejects.toThrow("Unauthorized");
      releaseRefresh(
        status === 200
          ? authResponse()
          : Response.json({ message: "Unauthorized" }, { status }),
      );
      await Promise.all([refreshAssertion, loggingOut]);
      expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
        "/api/auth/refresh",
        "/api/auth/logout",
      ]);
      const { user, loading } = useAuthStore.getState();
      expect({ user, loading }).toEqual({ user: null, loading: false });
    },
  );

  it("waits for an in-flight login before logout so the late login cannot revive the session", async () => {
    let releaseLogin!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseLogin = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const loggingIn = client.login(accountB.email, "password123");
    const loggingOut = client.logout();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    releaseLogin(authResponse(accountB));
    await Promise.all([loggingIn, loggingOut]);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/login",
      "/api/auth/logout",
    ]);
    const { user, loading } = useAuthStore.getState();
    expect({ user, loading }).toEqual({ user: null, loading: false });
  });

  it("does not start a refresh while logout is running, so a late answer cannot revive the session", async () => {
    fetchMock.mockResolvedValueOnce(authResponse());
    await client.login(accountA.email, "password123");
    let releaseLogout!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseLogout = resolve;
        }),
    );
    const loggingOut = client.logout();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await expect(client.refresh()).rejects.toThrow("로그아웃하고 있어요.");
    releaseLogout(new Response(null, { status: 204 }));
    await loggingOut;
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/login",
      "/api/auth/logout",
    ]);
    const { user, loading } = useAuthStore.getState();
    expect({ user, loading }).toEqual({ user: null, loading: false });
    expect(client.getAccessToken()).toBeNull();
  });

  it("retries a 401 once with the new token and preserves request options", async () => {
    fetchMock.mockResolvedValueOnce(authResponse(accountA, "old-token"));
    await client.login(accountA.email, "password123");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(authResponse(accountA, "new-token"));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const response = await client.apiFetch("/api/example", {
      method: "POST",
      body: "body",
      headers: { "X-Test": "kept" },
    });
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/login",
      "/api/example",
      "/api/auth/refresh",
      "/api/example",
    ]);
    const options = fetchMock.mock.calls[3][1];
    expect(options).toMatchObject({ method: "POST", body: "body" });
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer new-token",
    );
    expect(new Headers(options?.headers).get("X-Test")).toBe("kept");
  });

  it("does not loop when the retried request is still unauthorized", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(authResponse());
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await client.apiFetch("/api/users/me")).status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("clears the session when refresh fails and does not retry", async () => {
    fetchMock.mockResolvedValueOnce(authResponse());
    await client.login(accountA.email, "password123");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(
      Response.json({ message: "Unauthorized" }, { status: 401 }),
    );
    await expect(client.apiFetch("/api/users/me")).rejects.toThrow(
      "Unauthorized",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("reloads without retrying when another tab has changed accounts", async () => {
    fetchMock.mockResolvedValueOnce(authResponse());
    await client.login(accountA.email, "password123");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(authResponse(accountB));
    await expect(
      client.apiFetch("/api/example", {
        method: "POST",
        body: "account-A-data",
      }),
    ).rejects.toThrow("계정이 바뀌어");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("also blocks retry when this tab changes accounts while an old request is pending", async () => {
    fetchMock.mockResolvedValueOnce(authResponse());
    await client.login(accountA.email, "password123");
    let releaseRequest!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseRequest = resolve;
        }),
    );
    const oldRequest = client.apiFetch("/api/example", {
      method: "POST",
      body: "account-A-data",
    });
    fetchMock.mockResolvedValueOnce(authResponse(accountB));
    await client.login(accountB.email, "password123");
    fetchMock.mockResolvedValueOnce(authResponse(accountB));
    releaseRequest(new Response(null, { status: 401 }));
    await expect(oldRequest).rejects.toThrow("계정이 바뀌어");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.filter(([path]) => path === "/api/example"),
    ).toHaveLength(1);
  });

  it("reloads without retrying when another login completes after refresh and before retry", async () => {
    fetchMock.mockResolvedValueOnce(authResponse(accountA, "account-a-token"));
    await client.login(accountA.email, "password123");
    const unsubscribe = useAuthStore.subscribe(() => {
      if (useAuthStore.getState().user?.id === accountA.id) {
        unsubscribe();
        void client.login(accountB.email, "password123");
      }
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(authResponse(accountA, "account-a-token"));
    fetchMock.mockResolvedValueOnce(authResponse(accountB, "account-b-token"));
    await expect(
      client.apiFetch("/api/example", {
        method: "POST",
        body: "account-A-data",
      }),
    ).rejects.toThrow("계정이 바뀌어");
    const requests = fetchMock.mock.calls.filter(
      ([path]) => path === "/api/example",
    );
    expect(requests).toHaveLength(1);
    expect(new Headers(requests[0][1]?.headers).get("Authorization")).toBe(
      "Bearer account-a-token",
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toEqual(accountB);
  });

  it("preserves a string error code and joins validation messages", async () => {
    const error = await client.responseError(
      Response.json({
        message: ["첫 번째 오류", "두 번째 오류"],
        code: "REVERSE_PENDING",
      }),
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("첫 번째 오류 두 번째 오류");
    expect(error.code).toBe("REVERSE_PENDING");
  });

  it.each([undefined, null, 123, {}])(
    "ignores a non-string error code (%j)",
    async (code) => {
      const error = await client.responseError(
        Response.json({ message: "오류", code }),
      );
      expect(error.message).toBe("오류");
      expect(error).not.toHaveProperty("code");
    },
  );

  it("uses the fallback message for a non-JSON error response", async () => {
    const error = await client.responseError(
      new Response("Bad Gateway", { status: 502 }),
    );
    expect(error.status).toBe(502);
    expect(error.message).toBe(
      "요청을 처리하지 못했습니다. 다시 시도해 주세요.",
    );
  });

  it("preserves the HTTP status for consent failures", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ message: "위치 수집에 동의해 주세요." }, { status: 403 }),
    );
    await expect(
      client.apiRequest("/api/users/me/location"),
    ).rejects.toMatchObject({
      status: 403,
      message: "위치 수집에 동의해 주세요.",
    });
  });

  it("returns null for a 204 without parsing an empty body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(
      client.apiRequest("/api/dogs/2", { method: "DELETE" }),
    ).resolves.toBeNull();
  });

  it("throws the response message and code for a failed API request", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        {
          message: "이미 받은 요청이 있어요.",
          code: "REVERSE_PENDING",
        },
        { status: 409 },
      ),
    );
    await expect(client.apiRequest("/api/walk-requests")).rejects.toMatchObject(
      {
        message: "이미 받은 요청이 있어요.",
        code: "REVERSE_PENDING",
      },
    );
  });

  it("returns JSON and forwards the abort signal and request options", async () => {
    const controller = new AbortController();
    fetchMock.mockResolvedValueOnce(Response.json({ id: 2 }));
    await expect(
      client.apiRequest("/api/example", {
        signal: controller.signal,
        method: "PATCH",
        body: "body",
        headers: { "Content-Type": "application/json" },
      }),
    ).resolves.toEqual({ id: 2 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/example");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      signal: controller.signal,
      method: "PATCH",
      body: "body",
    });
    expect(
      new Headers(fetchMock.mock.calls[0][1]?.headers).get("Content-Type"),
    ).toBe("application/json");
  });

  it.each([201, 400])(
    "signs up outside the session cache and handles status %s",
    async (status) => {
      const body = {
        email: accountA.email,
        password: "password123",
        nickname: accountA.nickname,
        dog: {
          name: "보리",
          breed: "푸들",
          size: "SMALL",
          gender: "FEMALE",
          neutered: true,
          birthYear: 2021,
          personality: "같이 걸어요.",
        },
      };
      fetchMock.mockResolvedValueOnce(
        Response.json(
          status === 201 ? { id: 1 } : { message: "가입할 수 없어요." },
          { status },
        ),
      );
      const result = client.signup(body);
      if (status === 201) await expect(result).resolves.toBeUndefined();
      else await expect(result).rejects.toThrow("가입할 수 없어요.");
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(useAuthStore.getState().user).toBeNull();
      expect(client.getAccessToken()).toBeNull();
    },
  );
});
