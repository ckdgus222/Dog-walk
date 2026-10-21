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
    refetchInterval: 30_000,
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
    mutationFn: async (signal: AbortSignal) => {
      const geolocationError =
        "위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.";
      try {
        signal.throwIfAborted();
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            if (!navigator.geolocation)
              return reject(new Error(geolocationError));
            // Settle on abort right away so a cancelled send does not hold up
            // the next one for the whole geolocation timeout.
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
            navigator.geolocation.getCurrentPosition(
              resolve,
              () => reject(new Error(geolocationError)),
              { timeout: 10_000, maximumAge: 0 },
            );
          },
        );
        signal.throwIfAborted();
        const location = await apiRequest<Omit<MyLocation, "consented">>(
          "/api/users/me/location",
          {
            method: "PATCH",
            signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          },
        );
        return signal.aborted ? null : location;
      } catch (error) {
        if (signal.aborted) return null;
        throw error;
      }
    },
    onSuccess: async (location, signal) => {
      if (!location || signal.aborted) return;
      await queryClient.cancelQueries({ queryKey: ["location", "me"] });
      if (signal.aborted) return;
      const previous = queryClient.getQueryData<MyLocation>(["location", "me"]);
      queryClient.setQueryData<MyLocation>(["location", "me"], {
        ...location,
        consented: true,
      });
      if (previous?.lat !== location.lat || previous?.lng !== location.lng) {
        void queryClient.resetQueries({ queryKey: ["location", "nearby"] });
      } else {
        void queryClient.invalidateQueries({
          queryKey: ["location", "nearby"],
        });
      }
    },
    onError: (error, signal) => {
      if (!signal.aborted && "status" in error && error.status === 403) {
        void queryClient.invalidateQueries({ queryKey: ["location", "me"] });
      }
    },
  });
};
