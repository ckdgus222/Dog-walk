import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const accountA = { id: 1, email: "a@example.com", nickname: "보호자A" };
const accountB = { id: 2, email: "b@example.com", nickname: "보호자B" };

function authResponse(user = accountA, accessToken = "access-token") {
  return Response.json({ user, accessToken });
}

describe("Browser auth client", () => {
  let client: typeof import("./auth");
  const fetchMock = vi.fn<typeof fetch>();
  const reload = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    reload.mockReset();
    vi.stubGlobal("window", { location: { reload } });
    vi.stubGlobal("fetch", fetchMock);
    client = await import("./auth");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(client.getSession()).toEqual({ user: accountA, loading: false });
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
      expect(client.getSession()).toEqual({ user: null, loading: false });
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
    expect(client.getSession()).toEqual({ user: null, loading: false });
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

  it("reloads without retrying when another login completes after refresh and before retry", async () => {
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
    expect(client.getSession().user).toEqual(accountB);
  });
});
