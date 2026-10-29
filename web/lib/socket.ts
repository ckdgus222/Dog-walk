import { io } from "socket.io-client";
import { getAccessToken, refresh } from "./auth";
import { useAuthStore } from "./auth-store";

export const connectSocket = (signal: AbortSignal) => {
  const socket = io({
    auth: (callback) => callback({ token: getAccessToken() }),
  });
  let retried = false;

  const connectIfIdle = () => {
    if (signal.aborted || socket.connected || socket.active) return;
    socket.connect();
  };

  const reconnect = async () => {
    if (retried || signal.aborted) return;
    retried = true;
    try {
      await refresh();
      connectIfIdle();
    } catch {
      // A 401 clears auth and tears down this connection. Other failures
      // (logout in progress or network errors) wait for a new token to reconnect.
    }
  };

  socket.on("connect", () => {
    retried = false;
  });
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") void reconnect();
  });
  socket.on("connect_error", () => {
    if (!socket.active) void reconnect();
  });
  const unsubscribe = useAuthStore.subscribe((state, previous) => {
    if (state.accessToken && state.accessToken !== previous.accessToken) {
      connectIfIdle();
    }
  });
  const close = () => {
    unsubscribe();
    socket.disconnect();
  };
  signal.addEventListener("abort", close, { once: true });
  if (signal.aborted) close();
  return socket;
};
