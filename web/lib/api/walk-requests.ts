import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "../auth";
import type { WalkRequest } from "../types";

type NewWalkRequest = { receiverId: number; message: string };
type WalkRequestAnswer = {
  id: number;
  action: "accept" | "reject" | "cancel";
};
// Callers read the server's `code` to explain why a request was refused.
type WalkRequestError = Error & { code?: string };

const walkRequestsKey = ["walk-requests"];

export const useWalkRequests = (box: "received" | "sent") =>
  useQuery({
    queryKey: [...walkRequestsKey, box],
    queryFn: ({ signal }) =>
      apiRequest<WalkRequest[]>(`/api/walk-requests?box=${box}`, { signal }),
  });

export const usePendingCount = () =>
  useQuery({
    queryKey: [...walkRequestsKey, "pending-count"],
    queryFn: ({ signal }) =>
      apiRequest<{ count: number }>("/api/walk-requests/pending-count", {
        signal,
      }),
  });

export const refreshWalkRequests = async (queryClient: QueryClient) => {
  await queryClient.cancelQueries({ queryKey: walkRequestsKey });
  void queryClient.invalidateQueries({ queryKey: walkRequestsKey });
};

export const useSendWalkRequest = () => {
  const queryClient = useQueryClient();
  return useMutation<WalkRequest, WalkRequestError, NewWalkRequest>({
    mutationFn: (body) =>
      apiRequest<WalkRequest>("/api/walk-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => refreshWalkRequests(queryClient),
  });
};

export const useRespondToWalkRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: WalkRequestAnswer) =>
      apiRequest<WalkRequest>(`/api/walk-requests/${id}/${action}`, {
        method: "PATCH",
      }),
    onSuccess: () => refreshWalkRequests(queryClient),
  });
};
