import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "../auth";
import type { WalkRequest } from "../types";

export const useWalkRequests = (box: "received" | "sent") =>
  useQuery({
    queryKey: ["walk-requests", box],
    queryFn: ({ signal }) =>
      apiRequest<WalkRequest[]>(`/api/walk-requests?box=${box}`, { signal }),
  });

export const usePendingCount = () =>
  useQuery({
    queryKey: ["walk-requests", "pending-count"],
    queryFn: ({ signal }) =>
      apiRequest<{ count: number }>("/api/walk-requests/pending-count", {
        signal,
      }),
  });

export const refreshWalkRequests = async (queryClient: QueryClient) => {
  await queryClient.cancelQueries({ queryKey: ["walk-requests"] });
  void queryClient.invalidateQueries({ queryKey: ["walk-requests"] });
};

export const useSendWalkRequest = () => {
  const queryClient = useQueryClient();
  return useMutation<
    WalkRequest,
    Error & { code?: string },
    {
      receiverId: number;
      message: string;
    }
  >({
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
    mutationFn: ({
      id,
      action,
    }: {
      id: number;
      action: "accept" | "reject" | "cancel";
    }) =>
      apiRequest<WalkRequest>(`/api/walk-requests/${id}/${action}`, {
        method: "PATCH",
      }),
    onSuccess: () => refreshWalkRequests(queryClient),
  });
};
