import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const accountA = { id: 1, email: "a@example.com", nickname: "보호자A" };
const accountB = { id: 2, email: "b@example.com", nickname: "보호자B" };

function authResponse(user = accountA, accessToken = "access-token") {
  return Response.json({ user, accessToken });
}

describe("Browser auth client", () => {
  let client: typeof import("./auth");
  const fetchMock = vi.fn<typeof fetch>();
  const reload = vi.fn();
  let lockRequest: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    reload.mockReset();
    let queue = Promise.resolve();
    lockRequest = vi.fn((_name: string, callback: () => Promise<unknown>) => {
      const pending = queue.then(callback);
      queue = pending.then(
        () => {},
        () => {},
      );
      return pending;
    });
    vi.stubGlobal("navigator", { locks: { request: lockRequest } });
    vi.stubGlobal("window", { location: { reload } });
    vi.stubGlobal("fetch", fetchMock);
    client = await import("./auth");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares one refresh promise within a tab", async () => {
    fetchMock.mockResolvedValue(authResponse());
    const first = client.refresh();
    const second = client.refresh();
    expect(first).toBe(second);
    await expect(first).resolves.toEqual(accountA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lockRequest).toHaveBeenCalledWith(
      "auth-session",
      expect.any(Function),
    );
    expect(client.getSession()).toEqual({ user: accountA, loading: false });
  });

  it("serializes two tabs and keeps both signed in", async () => {
    let releaseFirst!: (response: Response) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseFirst = resolve;
        }),
    );
    fetchMock.mockResolvedValueOnce(authResponse());
    vi.resetModules();
    const secondTab = await import("./auth");
    const first = client.refresh();
    const second = secondTab.refresh();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    releaseFirst(authResponse());
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getSession().user).toEqual(accountA);
    expect(secondTab.getSession().user).toEqual(accountA);
  });

  it("waits for refresh before logout and never restores the logged out session", async () => {
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
    releaseRefresh(authResponse());
    await Promise.all([refreshing, loggingOut]);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/refresh",
      "/api/auth/logout",
    ]);
    expect(client.getSession()).toEqual({ user: null, loading: false });
  });

  it("keeps both tabs logged out when logout precedes the other tab refresh", async () => {
    fetchMock.mockResolvedValueOnce(authResponse());
    await client.login(accountA.email, "password123");
    vi.resetModules();
    const secondTab = await import("./auth");
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fetchMock.mockResolvedValueOnce(
      Response.json({ message: "Unauthorized" }, { status: 401 }),
    );
    const results = await Promise.allSettled([
      client.logout(),
      secondTab.refresh(),
    ]);
    expect(results.map(({ status }) => status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(client.getSession().user).toBeNull();
    expect(secondTab.getSession().user).toBeNull();
  });

  it("uses the same lock for login and preserves the order with refresh", async () => {
    fetchMock.mockResolvedValueOnce(authResponse());
    fetchMock.mockResolvedValueOnce(authResponse());
    await Promise.all([
      client.login(accountA.email, "password123"),
      client.refresh(),
    ]);
    expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
      "/api/auth/login",
      "/api/auth/refresh",
    ]);
    expect(lockRequest.mock.calls.map(([name]) => name)).toEqual([
      "auth-session",
      "auth-session",
    ]);
    expect(client.getSession().user).toEqual(accountA);
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
    expect(client.getSession().user).toBeNull();
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

  it("keeps the original account token when another login follows refresh", async () => {
    fetchMock.mockResolvedValueOnce(authResponse(accountA, "account-a-token"));
    await client.login(accountA.email, "password123");
    const unsubscribe = client.subscribe(() => {
      if (client.getSession().user?.id === accountA.id) {
        unsubscribe();
        void client.login(accountB.email, "password123");
      }
    });
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    fetchMock.mockResolvedValueOnce(authResponse(accountA, "account-a-token"));
    fetchMock.mockResolvedValueOnce(authResponse(accountB, "account-b-token"));
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    expect(
      (
        await client.apiFetch("/api/example", {
          method: "POST",
          body: "account-A-data",
        })
      ).status,
    ).toBe(200);
    const requests = fetchMock.mock.calls.filter(
      ([path]) => path === "/api/example",
    );
    expect(requests).toHaveLength(2);
    expect(new Headers(requests[1][1]?.headers).get("Authorization")).toBe(
      "Bearer account-a-token",
    );
  });
});
