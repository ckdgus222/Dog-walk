"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  refreshWalkRequests,
  usePendingCount,
} from "../../lib/api/walk-requests";
import { connectSocket } from "../../lib/socket";
import { useAuth } from "./auth-provider";
import type { WalkRequest } from "../../lib/types";

const emptyNotifications = {
  pendingCount: 0,
  incoming: null as WalkRequest | null,
  notice: "",
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
  const queryClient = useQueryClient();
  const count = usePendingCount();
  const [incoming, setIncoming] = useState<WalkRequest | null>(null);
  const [notice, setNotice] = useState("");
  const dismissIncoming = useCallback(() => setIncoming(null), []);
  const dismissNotice = useCallback(() => setNotice(""), []);

  useEffect(() => {
    const controller = new AbortController();
    const socket = connectSocket(controller.signal);
    socket.on("connect", () => void refreshWalkRequests(queryClient));
    socket.on("walk-request:received", (request: WalkRequest) => {
      setIncoming(request);
      void refreshWalkRequests(queryClient);
    });
    socket.on(
      "walk-request:changed",
      ({ id, status }: Pick<WalkRequest, "id" | "status">) => {
        if (status === "ACCEPTED") setNotice("보낸 산책 요청이 수락됐어요.");
        if (status === "REJECTED") setNotice("보낸 산책 요청이 거절됐어요.");
        if (status === "CANCELED") {
          setNotice("받은 산책 요청이 취소됐어요.");
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
        pendingCount: count.data?.count ?? 0,
        pendingCountError: count.error?.message ?? "",
        incoming,
        notice,
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
