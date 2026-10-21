import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../auth";
import type { Dog } from "../types";

export const useMyDogs = () =>
  useQuery({
    queryKey: ["dogs", "me"],
    queryFn: ({ signal }) => apiRequest<Dog[]>("/api/dogs/me", { signal }),
  });

export const useDogForEdit = (id: string) =>
  useQuery({
    queryKey: ["dogs", "edit", id],
    queryFn: async ({ signal }) => {
      const dogs = await apiRequest<Dog[]>("/api/dogs/me", { signal });
      const dog = dogs.find((dog) => String(dog.id) === id);
      if (!dog) throw new Error("반려견을 찾을 수 없어요.");
      return dog;
    },
  });

export const useSaveDog = (dogId?: number) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: FormData) =>
      apiRequest<Dog>(
        dogId === undefined ? "/api/dogs" : `/api/dogs/${dogId}`,
        {
          method: dogId === undefined ? "POST" : "PATCH",
          body,
        },
      ),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: ["dogs", "me"] });
      // Navigation must not wait for the list or refetch the mounted edit form.
      void queryClient.invalidateQueries({ queryKey: ["dogs", "me"] });
    },
  });
};

export const useDeleteDog = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiRequest<null>(`/api/dogs/${id}`, { method: "DELETE" }),
    onSuccess: async (_, id) => {
      await queryClient.cancelQueries({ queryKey: ["dogs", "me"] });
      queryClient.setQueryData<Dog[]>(["dogs", "me"], (dogs) =>
        dogs?.filter((dog) => dog.id !== id),
      );
    },
  });
};
