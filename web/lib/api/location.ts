import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../auth";
import type { MyLocation, Neighbor } from "../types";

const myLocationKey = ["location", "me"];
const nearbyKey = ["location", "nearby"];

export const useMyLocation = () =>
  useQuery({
    queryKey: myLocationKey,
    queryFn: ({ signal }) =>
      apiRequest<MyLocation>("/api/users/me/location", { signal }),
  });

export const useNearby = (enabled: boolean) =>
  useQuery({
    queryKey: nearbyKey,
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
      await queryClient.cancelQueries({ queryKey: myLocationKey });
      queryClient.setQueryData<MyLocation>(myLocationKey, {
        consented,
        lat: null,
        lng: null,
        updatedAt: null,
      });
      await queryClient.cancelQueries({ queryKey: nearbyKey });
      queryClient.removeQueries({ queryKey: nearbyKey });
    },
  });
};

const geolocationError =
  "위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.";

const getCurrentPosition = (signal: AbortSignal) =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error(geolocationError));
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
  });

const sendMyLocation = async (signal: AbortSignal) => {
  signal.throwIfAborted();
  const { coords } = await getCurrentPosition(signal);
  signal.throwIfAborted();
  return apiRequest<Omit<MyLocation, "consented">>("/api/users/me/location", {
    method: "PATCH",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude }),
  });
};

export const useUpdateMyLocation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    // A cancelled send ends with null instead of an error, so nothing is shown.
    mutationFn: async (signal: AbortSignal) => {
      try {
        const location = await sendMyLocation(signal);
        return signal.aborted ? null : location;
      } catch (error) {
        if (signal.aborted) return null;
        throw error;
      }
    },
    onSuccess: async (location, signal) => {
      if (!location || signal.aborted) return;
      await queryClient.cancelQueries({ queryKey: myLocationKey });
      if (signal.aborted) return;

      const previous = queryClient.getQueryData<MyLocation>(myLocationKey);
      queryClient.setQueryData<MyLocation>(myLocationKey, {
        ...location,
        consented: true,
      });

      // Neighbors around the old spot are wrong after a move, so drop them
      // instead of showing them while the new list loads.
      const moved =
        previous?.lat !== location.lat || previous?.lng !== location.lng;
      if (moved) void queryClient.resetQueries({ queryKey: nearbyKey });
      else void queryClient.invalidateQueries({ queryKey: nearbyKey });
    },
    onError: (error, signal) => {
      if (!signal.aborted && "status" in error && error.status === 403) {
        void queryClient.invalidateQueries({ queryKey: myLocationKey });
      }
    },
  });
};
