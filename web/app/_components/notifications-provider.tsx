"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import { addChatMessage } from "../../lib/api/chat";
import {
  refreshWalkRequests,
  usePendingCount,
} from "../../lib/api/walk-requests";
import { connectSocket } from "../../lib/socket";
import { useAuth } from "./auth-provider";
import type { ChatMessage, WalkRequest } from "../../lib/types";

type Notice = { text: string; href: string };

const emptyNotifications = {
  pendingCount: 0,
  incoming: null as WalkRequest | null,
  notice: null as Notice | null,
  socket: null as Socket | null,
  pendingCountError: "",
  dismissIncoming: () => {},
  dismissNotice: () => {},
};
const NotificationsContext = createContext(emptyNotifications);

export const NotificationsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user } = useAuth();
  return user ? (
    <UserNotifications key={user.id}>{children}</UserNotifications>
  ) : (
    <NotificationsContext.Provider value={emptyNotifications}>
      {children}
    </NotificationsContext.Provider>
  );
};

const UserNotifications = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const pendingCount = usePendingCount();
  const [incoming, setIncoming] = useState<WalkRequest | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const dismissIncoming = useCallback(() => setIncoming(null), []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const receiveChatMessage = useEffectEvent((message: ChatMessage) => {
    void addChatMessage(queryClient, message);
    const href = `/chat/${message.walkRequestId}`;
    if (message.senderId !== user?.id && pathname !== href) {
      setNotice({ text: `${message.senderNickname}님의 새 메시지`, href });
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    const socket = connectSocket(controller.signal);
    // The shared socket is created after mounting, then published to consumers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(socket);
    socket.on("connect", () => void refreshWalkRequests(queryClient));
    socket.on("chat:message", (message: ChatMessage) =>
      receiveChatMessage(message),
    );
    socket.on("walk-request:received", (request: WalkRequest) => {
      setIncoming(request);
      void refreshWalkRequests(queryClient);
    });
    socket.on(
      "walk-request:changed",
      ({ id, status }: Pick<WalkRequest, "id" | "status">) => {
        if (status === "ACCEPTED")
          setNotice({
            text: "보낸 산책 요청이 수락됐어요.",
            href: "/walk-requests",
          });
        if (status === "REJECTED")
          setNotice({
            text: "보낸 산책 요청이 거절됐어요.",
            href: "/walk-requests",
          });
        if (status === "CANCELED") {
          setNotice({
            text: "받은 산책 요청이 취소됐어요.",
            href: "/walk-requests",
          });
          setIncoming((previous) => (previous?.id === id ? null : previous));
        }
        void refreshWalkRequests(queryClient);
      },
    );
    return () => {
      controller.abort();
      socket.removeAllListeners();
    };
  }, [queryClient]);

  return (
    <NotificationsContext.Provider
      value={{
        pendingCount: pendingCount.data?.count ?? 0,
        pendingCountError: pendingCount.error?.message ?? "",
        incoming,
        notice,
        socket,
        dismissIncoming,
        dismissNotice,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  return useContext(NotificationsContext);
};
