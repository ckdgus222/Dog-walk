import { io } from "socket.io-client";
import { getAccessToken, refresh } from "./auth";

export const connectSocket = (signal: AbortSignal) => {
  const socket = io({
    auth: (callback) => callback({ token: getAccessToken() }),
  });
  let retried = false;

  const reconnect = async () => {
    if (retried || signal.aborted) return;
    retried = true;
    try {
      await refresh();
      if (!signal.aborted) socket.connect();
    } catch {
      // refresh clears the login session on failure.
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
  signal.addEventListener("abort", () => socket.disconnect(), { once: true });
  if (signal.aborted) socket.disconnect();
  return socket;
};
