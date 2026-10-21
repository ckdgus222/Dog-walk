import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import { apiRequest } from "../auth";
import type { ChatHistory, ChatMessage } from "../types";

export const mergeMessages = (
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] => {
  const messages = new Map(
    [...current, ...incoming].map((message) => [message.id, message]),
  );
  return [...messages.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id - b.id,
  );
};

export const useChatHistory = (walkRequestId: number) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["chat", walkRequestId],
    queryFn: async ({ signal }) => {
      const history = await apiRequest<ChatHistory>(
        `/api/walk-requests/${walkRequestId}/messages`,
        { signal },
      );
      const cached = queryClient.getQueryData<ChatHistory>([
        "chat",
        walkRequestId,
      ]);
      return {
        ...history,
        messages: mergeMessages(history.messages, cached?.messages ?? []),
      };
    },
  });
};

export const addChatMessage = async (
  queryClient: QueryClient,
  message: ChatMessage,
) => {
  const queryKey = ["chat", message.walkRequestId];
  if (queryClient.getQueryData<ChatHistory>(queryKey)) {
    queryClient.setQueryData<ChatHistory>(queryKey, (current) =>
      current
        ? { ...current, messages: mergeMessages(current.messages, [message]) }
        : current,
    );
  } else if (queryClient.isFetching({ queryKey })) {
    await queryClient.cancelQueries({ queryKey });
    await queryClient.invalidateQueries({ queryKey });
  }
};

export const useSendChatMessage = (
  socket: Socket | null,
  walkRequestId: number,
) =>
  useMutation({
    mutationFn: async (content: string) => {
      const connectionError = "메시지를 보내지 못했어요. 연결을 확인해 주세요.";
      if (!socket?.connected) throw new Error(connectionError);
      const trimmed = content.trim();
      if (!trimmed || trimmed.length > 500)
        throw new Error("메시지는 1~500자로 입력해 주세요.");

      let ack: { ok: true } | { ok: false; message: string };
      try {
        ack = await socket.timeout(10_000).emitWithAck("chat:send", {
          walkRequestId,
          content: trimmed,
        });
      } catch {
        throw new Error(connectionError);
      }
      if (!ack.ok) throw new Error(ack.message);
    },
  });
