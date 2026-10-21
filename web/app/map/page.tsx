"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "../auth-provider";
import { apiFetch, responseError } from "../../lib/auth";
import type { Dog } from "../dogs/dog-form";
import dogStyles from "../dogs/dogs.module.css";
import styles from "./map.module.css";
import KakaoMap from "./kakao-map";

type Location = {
  consented: boolean;
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
};
type Neighbor = {
  userId: number;
  nickname: string;
  lat: number;
  lng: number;
  distanceM: number;
  dogs: Dog[];
};
const sizeLabels = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" };
// A stable empty list, so the map is not rebuilt on every render while loading.
const noNeighbors: Neighbor[] = [];
const geolocationError =
  "위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.";

export default function MapPage() {
  const { user, loading } = useAuth();
  return (
    <main className={dogStyles.main}>
      <h1>지도</h1>
      {loading ? (
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      ) : !user ? (
        <Link href="/login">로그인</Link>
      ) : (
        <LocationPanel key={user.id} />
      )}
      <Link href="/">홈으로</Link>
    </main>
  );
}

function LocationPanel() {
  const [location, setLocation] = useState<Location | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbor[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [nearbyError, setNearbyError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadLocation() {
      try {
        const response = await apiFetch("/api/users/me/location", {
          signal: controller.signal,
        });
        if (!response.ok) throw await responseError(response);
        const result: Location = await response.json();
        if (!controller.signal.aborted) setLocation(result);
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "불러오지 못했습니다.",
          );
      }
    }
    void loadLocation();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!location?.consented || location.lat === null || location.lng === null)
      return;
    const controller = new AbortController();
    async function loadNearby() {
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
    }
    void loadNearby();
    return () => controller.abort();
  }, [location]);

  async function changeConsent(consented: boolean) {
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
  }

  async function updateLocation() {
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
      const result: Omit<Location, "consented"> = await response.json();
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
  }

  const selected = neighbors?.find(
    (neighbor) => neighbor.userId === selectedId,
  );
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {!location && !error && <p role="status">위치 상태를 불러오고 있어요.</p>}
      {location &&
        (!location.consented ? (
          <>
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
        ) : (
          <>
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
                    <section aria-label="주변 산책 친구">
                      <h2>주변 산책 친구 {neighbors.length}명</h2>
                      {neighbors.length === 0 && (
                        <p>1km 안에 아직 아무도 없어요.</p>
                      )}
                      <ul className={styles.neighbors}>
                        {neighbors.map((neighbor) => (
                          <li key={neighbor.userId}>
                            <button
                              type="button"
                              onClick={() => setSelectedId(neighbor.userId)}
                              aria-pressed={selectedId === neighbor.userId}
                            >
                              <strong>{neighbor.nickname}</strong>
                              <span>약 {neighbor.distanceM}m</span>
                              <span>
                                {neighbor.dogs
                                  .map((dog) => dog.name)
                                  .join(", ")}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                {selected && (
                  <section
                    className={styles.selected}
                    aria-label={`${selected.nickname}의 반려견`}
                  >
                    <h2>{selected.nickname}</h2>
                    <p>약 {selected.distanceM}m</p>
                    <div className={dogStyles.cards}>
                      {selected.dogs.map((dog) => (
                        <article key={dog.id} className={dogStyles.card}>
                          {dog.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className={dogStyles.photo}
                              src={dog.photoUrl}
                              alt={`${dog.name} 사진`}
                            />
                          ) : (
                            <p>사진 없음</p>
                          )}
                          <h3>{dog.name}</h3>
                          <p>
                            {dog.breed} · {sizeLabels[dog.size]} ·{" "}
                            {dog.gender === "MALE" ? "수컷" : "암컷"}
                          </p>
                          <p>
                            {dog.neutered
                              ? "중성화했어요"
                              : "중성화하지 않았어요"}{" "}
                            · {dog.birthYear}년생
                          </p>
                          <p>{dog.personality}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </>
        ))}
    </>
  );
}
