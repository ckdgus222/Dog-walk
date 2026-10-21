"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "../_components/auth-gate";
import { apiFetch, responseError } from "../../lib/auth";
import type { MyLocation, Neighbor } from "../../lib/types";
import styles from "../_components/shared.module.css";
import KakaoMap from "./kakao-map";
import { NeighborList } from "./neighbor-list";
import { NeighborDetail } from "./neighbor-detail";

// A stable empty list, so the map is not rebuilt on every render while loading.
const noNeighbors: Neighbor[] = [];
const geolocationError =
  "위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.";

const MapPage = () => {
  return (
    <main className={styles.main}>
      <h1>지도</h1>
      <AuthGate>
        <LocationPanel />
      </AuthGate>
      <Link href="/">홈으로</Link>
    </main>
  );
};
export default MapPage;

const LocationPanel = () => {
  const [location, setLocation] = useState<MyLocation | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbor[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nearbyError, setNearbyError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const loadLocation = async () => {
      try {
        const response = await apiFetch("/api/users/me/location", {
          signal: controller.signal,
        });
        if (!response.ok) throw await responseError(response);
        const result: MyLocation = await response.json();
        if (!controller.signal.aborted) setLocation(result);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "불러오지 못했습니다.",
          );
      }
    };
    void loadLocation();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!location?.consented || location.lat === null || location.lng === null)
      return;
    const controller = new AbortController();
    const loadNearby = async () => {
      try {
        const response = await apiFetch("/api/users/nearby", {
          signal: controller.signal,
        });
        if (!response.ok) throw await responseError(response);
        const result: Neighbor[] = await response.json();
        if (!controller.signal.aborted) setNeighbors(result);
      } catch (error) {
        if (!controller.signal.aborted)
          setNearbyError(
            error instanceof Error
              ? error.message
              : "주변 사용자를 불러오지 못했어요.",
          );
      }
    };
    void loadNearby();
    return () => controller.abort();
  }, [location]);

  const changeConsent = async (consented: boolean) => {
    if (
      !consented &&
      !window.confirm("위치 공개를 끌까요? 저장한 위치도 지워져요.")
    )
      return;
    setPending(true);
    setError("");
    try {
      const response = await apiFetch("/api/users/me/location-consent", {
        method: consented ? "POST" : "DELETE",
      });
      if (!response.ok) throw await responseError(response);
      setLocation({ consented, lat: null, lng: null, updatedAt: null });
      setNeighbors(null);
      setSelectedId(null);
      setNearbyError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "동의 상태를 바꾸지 못했어요.",
      );
    } finally {
      setPending(false);
    }
  };

  const updateLocation = async () => {
    setPending(true);
    setError("");
    try {
      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          if (!navigator.geolocation)
            return reject(new Error(geolocationError));
          navigator.geolocation.getCurrentPosition(
            resolve,
            () => reject(new Error(geolocationError)),
            {
              timeout: 10_000,
              maximumAge: 0,
            },
          );
        },
      );
      const response = await apiFetch("/api/users/me/location", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      });
      if (!response.ok) throw await responseError(response);
      const result: Omit<MyLocation, "consented"> = await response.json();
      setLocation({ ...result, consented: true });
      setNeighbors(null);
      setSelectedId(null);
      setNearbyError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "위치를 저장하지 못했어요.",
      );
    } finally {
      setPending(false);
    }
  };

  const selected = neighbors?.find(
    (neighbor) => neighbor.userId === selectedId,
  );
  if (!location) {
    return error ? (
      <p role="alert">{error}</p>
    ) : (
      <p role="status">위치 상태를 불러오고 있어요.</p>
    );
  }

  if (!location.consented) {
    return (
      <>
        {error && <p role="alert">{error}</p>}
        <p>
          내 위치를 약 200m 단위로 흐려서 저장하고, 7일 동안 주변 사용자에게
          보여 줘요. 저장된 위치는 공개를 끌 때까지 보관되고, 언제든 끌 수
          있어요.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => void changeConsent(true)}
        >
          동의하고 위치 공개
        </button>
      </>
    );
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => void updateLocation()}
      >
        내 위치 갱신
      </button>
      {location.updatedAt && (
        <p>
          마지막 갱신:{" "}
          <time dateTime={location.updatedAt}>
            {new Date(location.updatedAt).toLocaleString("ko-KR")}
          </time>
        </p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => void changeConsent(false)}
      >
        위치 공개 끄기
      </button>
      {location.lat !== null && location.lng !== null && (
        <>
          <KakaoMap
            lat={location.lat}
            lng={location.lng}
            neighbors={neighbors ?? noNeighbors}
            onSelect={setSelectedId}
          />
          {nearbyError && <p role="alert">{nearbyError}</p>}
          {!nearbyError &&
            (neighbors === null ? (
              <p role="status">주변 사용자를 불러오고 있어요.</p>
            ) : (
              <NeighborList
                neighbors={neighbors}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            ))}
          {selected && <NeighborDetail neighbor={selected} />}
        </>
      )}
    </>
  );
};
