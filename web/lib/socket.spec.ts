import { beforeEach, describe, expect, it, vi } from "vitest";
import { io } from "socket.io-client";
import { getAccessToken, refresh } from "./auth";
import { connectSocket } from "./socket";

vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("./auth", () => ({ getAccessToken: vi.fn(), refresh: vi.fn() }));

describe("Socket authentication and reconnection", () => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
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
    socket.active = false;
    vi.mocked(io).mockReturnValue(socket as unknown as ReturnType<typeof io>);
    vi.mocked(refresh).mockResolvedValue({
      id: 1,
      email: "a@example.com",
      nickname: "보호자",
    });
    controller = new AbortController();
    connectSocket(controller.signal);
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
      finish({ id: 1, email: "a@example.com", nickname: "보호자" });
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
