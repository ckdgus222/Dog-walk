import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiRequest, responseError } from "../auth";
import type { Diary } from "../types";

export const useDiaries = (dogId?: number) =>
  useQuery({
    queryKey: ["diaries", "list", dogId ?? "all"],
    queryFn: ({ signal }) =>
      apiRequest<Diary[]>(
        `/api/diaries${dogId === undefined ? "" : `?dogId=${dogId}`}`,
        { signal },
      ),
  });

export const useDiary = (id: number, forEdit = false) =>
  useQuery({
    queryKey: ["diaries", "detail", id],
    queryFn: ({ signal }) =>
      apiRequest<Diary>(`/api/diaries/${id}`, { signal }),
    // Editing needs a fresh read; detail can use the saved response immediately.
    refetchOnMount: forEdit ? "always" : false,
  });

export const useDiaryImage = (diaryId: number, imageId: number) =>
  useQuery({
    queryKey: ["diaries", "image", diaryId, imageId],
    queryFn: async ({ signal }) => {
      const response = await apiFetch(
        `/api/diaries/${diaryId}/images/${imageId}`,
        { signal },
      );
      if (!response.ok) throw await responseError(response);
      return response.blob();
    },
    staleTime: Infinity,
  });

export const useSaveDiary = (id?: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FormData) =>
      apiRequest<Diary>(
        id === undefined ? "/api/diaries" : `/api/diaries/${id}`,
        {
          method: id === undefined ? "POST" : "PATCH",
          body,
        },
      ),
    onSuccess: async (diary) => {
      await queryClient.cancelQueries({
        queryKey: ["diaries", "detail", diary.id],
      });
      queryClient.setQueryData(["diaries", "detail", diary.id], diary);
      await queryClient.cancelQueries({ queryKey: ["diaries", "list"] });
      // Refetching the list must not delay navigation or unmount the edit form.
      void queryClient.invalidateQueries({ queryKey: ["diaries", "list"] });
    },
  });
};

export const useDeleteDiary = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<null>(`/api/diaries/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: ["diaries"] });
      void queryClient.invalidateQueries({ queryKey: ["diaries"] });
    },
  });
};
