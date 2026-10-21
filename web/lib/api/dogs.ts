import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../auth";
import type { Dog } from "../types";

const myDogsKey = ["dogs", "me"];

const fetchMyDogs = (signal: AbortSignal) =>
  apiRequest<Dog[]>("/api/dogs/me", { signal });

export const useMyDogs = () =>
  useQuery({
    queryKey: myDogsKey,
    queryFn: ({ signal }) => fetchMyDogs(signal),
  });

export const useDogForEdit = (id: string) =>
  useQuery({
    queryKey: ["dogs", "edit", id],
    queryFn: async ({ signal }) => {
      const dogs = await fetchMyDogs(signal);
      const dog = dogs.find((dog) => String(dog.id) === id);
      if (!dog) throw new Error("반려견을 찾을 수 없어요.");
      return dog;
    },
  });

export const useSaveDog = (dogId?: number) => {
  const queryClient = useQueryClient();
  const isNew = dogId === undefined;
  return useMutation({
    mutationFn: (body: FormData) =>
      apiRequest<Dog>(isNew ? "/api/dogs" : `/api/dogs/${dogId}`, {
        method: isNew ? "POST" : "PATCH",
        body,
      }),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: myDogsKey });
      // Navigation must not wait for the list or refetch the mounted edit form.
      void queryClient.invalidateQueries({ queryKey: myDogsKey });
    },
  });
};

export const useDeleteDog = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<null>(`/api/dogs/${id}`, { method: "DELETE" }),
    onSuccess: async (_, id) => {
      await queryClient.cancelQueries({ queryKey: myDogsKey });
      queryClient.setQueryData<Dog[]>(myDogsKey, (dogs) =>
        dogs?.filter((dog) => dog.id !== id),
      );
    },
  });
};
