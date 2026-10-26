import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiRequest, responseError } from "../auth";
import type { Diary, DiaryList } from "../types";

// The api's diary PAGE_SIZE (api/src/diaries/diaries.service.ts).
export const DIARY_PAGE_SIZE = 6;

// Cover navigation after saving without keeping external edits stale for long.
const DETAIL_STALE_TIME = 10_000;

const allDiariesKey = ["diaries"];
const diaryListKey = ["diaries", "list"];
const diaryDetailKey = (id: number) => ["diaries", "detail", id];

export const useDiaries = (dogId?: number, page = 1) => {
  const query = new URLSearchParams({ page: String(page) });
  if (dogId !== undefined) query.set("dogId", String(dogId));
  return useQuery({
    queryKey: [...diaryListKey, dogId ?? "all", page],
    queryFn: ({ signal }) =>
      apiRequest<DiaryList>(`/api/diaries?${query}`, { signal }),
  });
};

export const useDiary = (id: number, forEdit = false) =>
  useQuery({
    queryKey: diaryDetailKey(id),
    queryFn: ({ signal }) =>
      apiRequest<Diary>(`/api/diaries/${id}`, { signal }),
    // Editing always reads again; detail reuses recent reads and save responses.
    staleTime: DETAIL_STALE_TIME,
    refetchOnMount: forEdit ? "always" : true,
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

export const useSaveDiary = (id?: number, onSaved?: () => void) => {
  const queryClient = useQueryClient();
  const isNew = id === undefined;
  return useMutation({
    mutationFn: (body: FormData) =>
      apiRequest<Diary>(isNew ? "/api/diaries" : `/api/diaries/${id}`, {
        method: isNew ? "POST" : "PATCH",
        body,
      }),
    onSuccess: async (diary) => {
      const detailKey = diaryDetailKey(diary.id);
      await queryClient.cancelQueries({ queryKey: detailKey });
      queryClient.setQueryData(detailKey, diary);

      await queryClient.cancelQueries({ queryKey: diaryListKey });
      // Refetching the list must not delay navigation or unmount the edit form.
      void queryClient.invalidateQueries({ queryKey: diaryListKey });
      onSaved?.();
    },
  });
};

export const useDeleteDiary = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<null>(`/api/diaries/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: allDiariesKey });
      void queryClient.invalidateQueries({ queryKey: allDiariesKey });
    },
  });
};
