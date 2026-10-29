import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { io } from "socket.io-client";
import { getAccessToken, refresh } from "./auth";
import { connectSocket } from "./socket";
import { useAuthStore } from "./auth-store";

vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("./auth", () => ({ getAccessToken: vi.fn(), refresh: vi.fn() }));

describe("Socket authentication and reconnection", () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    connected: false,
    active: false,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  let controller: AbortController;

  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    socket.connected = false;
    socket.active = false;
    socket.connect.mockReset();
    useAuthStore.setState({ accessToken: null });
    vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
    vi.mocked(refresh).mockResolvedValue({
      id: 1,
      email: "a@example.com",
      nickname: "보호자",
      isDemo: false,
    });
    controller = new AbortController();
    connectSocket(controller.signal);
  });

  afterEach(() => {
    controller.abort();
  });

  it("reads the current access token on every handshake", () => {
    const options = vi.mocked(io).mock.calls[0][0] as unknown as {
      auth: (callback: (auth: unknown) => void) => void;
    };
    const callback = vi.fn();
    vi.mocked(getAccessToken)
      .mockReturnValueOnce("old-token")
      .mockReturnValueOnce("new-token");
    options.auth(callback);
    options.auth(callback);
    expect(callback.mock.calls).toEqual([
      [{ token: "old-token" }],
      [{ token: "new-token" }],
    ]);
  });

  it.each(["disconnect", "connect_error"])(
    "refreshes before reconnecting after %s",
    async (event) => {
      let finish!: (user: Awaited<ReturnType<typeof refresh>>) => void;
      vi.mocked(refresh).mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      handlers.get(event)!("io server disconnect");
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(socket.connect).not.toHaveBeenCalled();
      finish({ id: 1, email: "a@example.com", nickname: "보호자", isDemo: false });
      await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
    },
  );

  it.each(["disconnect", "connect_error"])(
    "does not reconnect when refresh fails after %s",
    async (event) => {
      vi.mocked(refresh).mockRejectedValueOnce(new Error("Unauthorized"));
      handlers.get(event)!("io server disconnect");
      await Promise.resolve();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(socket.connect).not.toHaveBeenCalled();
    },
  );

  it("allows only one refresh until a connection succeeds, including overlapping failures", async () => {
    handlers.get("disconnect")!("io server disconnect");
    handlers.get("connect_error")!();
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(1));
    handlers.get("connect_error")!();
    expect(refresh).toHaveBeenCalledTimes(1);
    handlers.get("connect")!();
    handlers.get("disconnect")!("io server disconnect");
    await vi.waitFor(() => expect(socket.connect).toHaveBeenCalledTimes(2));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("leaves network reconnection to Socket.IO", () => {
    socket.active = true;
    handlers.get("disconnect")!("transport close");
    handlers.get("connect_error")!();
    expect(refresh).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("reconnects on a new token after refresh is rejected during logout", async () => {
    vi.mocked(refresh).mockRejectedValueOnce(new Error("로그아웃하고 있어요."));
    handlers.get("disconnect")!("io server disconnect");
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(socket.connect).not.toHaveBeenCalled();

    useAuthStore.setState({ accessToken: "new-token" });
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it.each(["connected", "active"] as const)(
    "ignores a new token when the socket is %s",
    (state) => {
      socket[state] = true;
      useAuthStore.setState({ accessToken: "new-token" });
      expect(socket.connect).not.toHaveBeenCalled();
    },
  );

  it("ignores an unchanged token or a null token", () => {
    useAuthStore.setState({ accessToken: "new-token" });
    socket.connect.mockClear();

    useAuthStore.setState({ accessToken: "new-token" });
    useAuthStore.setState({ accessToken: null });
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("ignores a new token after the signal is aborted", () => {
    controller.abort();
    useAuthStore.setState({ accessToken: "new-token" });
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it("connects only once when the token subscription and refresh both reconnect", async () => {
    socket.connect.mockImplementation(() => {
      socket.active = true;
    });
    vi.mocked(refresh).mockImplementationOnce(async () => {
      useAuthStore.setState({ accessToken: "new-token" });
      return { id: 1, email: "a@example.com", nickname: "보호자", isDemo: false };
    });
    handlers.get("disconnect")!("io server disconnect");
    await Promise.resolve();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it("does not revive a socket if the user leaves while refresh is pending", async () => {
    handlers.get("disconnect")!("io server disconnect");
    controller.abort();
    await Promise.resolve();
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).not.toHaveBeenCalled();
    handlers.get("connect_error")!();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
