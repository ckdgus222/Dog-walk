import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../auth";
import type { MyLocation, Neighbor } from "../types";

export const useMyLocation = () =>
  useQuery({
    queryKey: ["location", "me"],
    queryFn: ({ signal }) =>
      apiRequest<MyLocation>("/api/users/me/location", { signal }),
  });

export const useNearby = (enabled: boolean) =>
  useQuery({
    queryKey: ["location", "nearby"],
    queryFn: ({ signal }) =>
      apiRequest<Neighbor[]>("/api/users/nearby", { signal }),
    enabled,
  });

export const useChangeLocationConsent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (consented: boolean) =>
      apiRequest<null>("/api/users/me/location-consent", {
        method: consented ? "POST" : "DELETE",
      }),
    onSuccess: async (_, consented) => {
      await queryClient.cancelQueries({ queryKey: ["location", "me"] });
      queryClient.setQueryData<MyLocation>(["location", "me"], {
        consented,
        lat: null,
        lng: null,
        updatedAt: null,
      });
      await queryClient.cancelQueries({ queryKey: ["location", "nearby"] });
      queryClient.removeQueries({ queryKey: ["location", "nearby"] });
    },
  });
};

export const useUpdateMyLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const geolocationError =
        "위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.";
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          if (!navigator.geolocation)
            return reject(new Error(geolocationError));
          navigator.geolocation.getCurrentPosition(
            resolve,
            () => reject(new Error(geolocationError)),
            { timeout: 10_000, maximumAge: 0 },
          );
        },
      );
      return apiRequest<Omit<MyLocation, "consented">>(
        "/api/users/me/location",
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          }),
        },
      );
    },
    onSuccess: async (location) => {
      await queryClient.cancelQueries({ queryKey: ["location", "me"] });
      queryClient.setQueryData<MyLocation>(["location", "me"], {
        ...location,
        consented: true,
      });
      void queryClient.resetQueries({ queryKey: ["location", "nearby"] });
    },
  });
};
