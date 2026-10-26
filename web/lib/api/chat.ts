import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { Socket } from "socket.io-client";
import { apiRequest } from "../auth";
import type { ChatHistory, ChatMessage } from "../types";

type ChatAck = { ok: true } | { ok: false; message: string };

export const chatKey = (walkRequestId: number) => ["chat", walkRequestId];

const connectionError = "메시지를 보내지 못했어요. 연결을 확인해 주세요.";

export const mergeMessages = (
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] => {
  const byId = new Map(
    [...current, ...incoming].map((message) => [message.id, message]),
  );
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
      a.id - b.id,
  );
};

export const useChatHistory = (walkRequestId: number) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: chatKey(walkRequestId),
    queryFn: async ({ signal }) => {
      const history = await apiRequest<ChatHistory>(
        `/api/walk-requests/${walkRequestId}/messages`,
        { signal },
      );
      // Socket messages already in the cache can be newer than this response.
      const cached = queryClient.getQueryData<ChatHistory>(
        chatKey(walkRequestId),
      );
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
  const queryKey = chatKey(message.walkRequestId);
  const current = queryClient.getQueryData<ChatHistory>(queryKey);
  if (current) {
    queryClient.setQueryData<ChatHistory>(queryKey, {
      ...current,
      messages: mergeMessages(current.messages, [message]),
    });
  } else if (queryClient.isFetching({ queryKey })) {
    // The running fetch may have started before this message was saved.
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
      if (!socket?.connected) throw new Error(connectionError);
      const trimmed = content.trim();
      if (!trimmed || trimmed.length > 500)
        throw new Error("메시지는 1~500자로 입력해 주세요.");

      const ack: ChatAck = await socket
        .timeout(10_000)
        .emitWithAck("chat:send", { walkRequestId, content: trimmed })
        .catch(() => {
          throw new Error(connectionError);
        });
      if (!ack.ok) throw new Error(ack.message);
    },
  });
