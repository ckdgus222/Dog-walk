"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiFetch, responseError } from "../lib/auth";
import { connectSocket } from "../lib/socket";
import { useAuth } from "./auth-provider";
import type { Dog } from "./dogs/dog-form";

export type WalkRequest = {
  id: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELED";
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  counterpart: { id: number; nickname: string; dogs: Dog[] };
};

const emptyNotifications = {
  pendingCount: 0,
  incoming: null as WalkRequest | null,
  notice: "",
  requestsVersion: 0,
  refreshRequests: () => {},
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
  const [pendingCount, setPendingCount] = useState(0);
  const [incoming, setIncoming] = useState<WalkRequest | null>(null);
  const [notice, setNotice] = useState("");
  const [requestsVersion, setRequestsVersion] = useState(0);
  const refreshRequests = useCallback(
    () => setRequestsVersion((version) => version + 1),
    [],
  );
  const dismissIncoming = useCallback(() => setIncoming(null), []);
  const dismissNotice = useCallback(() => setNotice(""), []);

  useEffect(() => {
    const controller = new AbortController();
    const socket = connectSocket(controller.signal);
    // Mounting this keyed provider runs the count/list effects for this login.
    socket.on("connect", refreshRequests);
    socket.on("walk-request:received", (request: WalkRequest) => {
      setIncoming(request);
      refreshRequests();
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
        refreshRequests();
      },
    );
    return () => {
      controller.abort();
      socket.removeAllListeners();
    };
  }, [refreshRequests]);

  useEffect(() => {
    const controller = new AbortController();
    const loadCount = async () => {
      try {
        const response = await apiFetch("/api/walk-requests/pending-count", {
          signal: controller.signal,
        });
        if (!response.ok) throw await responseError(response);
        const result: { count: number } = await response.json();
        if (!controller.signal.aborted) setPendingCount(result.count);
      } catch (error) {
        if (!controller.signal.aborted)
          setNotice(
            error instanceof Error
              ? error.message
              : "받은 요청 수를 불러오지 못했어요.",
          );
      }
    };
    void loadCount();
    return () => controller.abort();
  }, [requestsVersion]);

  return (
    <NotificationsContext.Provider
      value={{
        pendingCount,
        incoming,
        notice,
        requestsVersion,
        refreshRequests,
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
