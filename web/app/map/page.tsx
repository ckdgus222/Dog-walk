"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthGate } from "../_components/auth-gate";
import {
  useChangeLocationConsent,
  useMyLocation,
  useNearby,
  useUpdateMyLocation,
} from "../../lib/api/location";
import type { Neighbor } from "../../lib/types";
import styles from "../_components/shared.module.css";
import KakaoMap from "./kakao-map";
import { NeighborList } from "./neighbor-list";
import { NeighborDetail } from "./neighbor-detail";

// A stable empty list, so the map is not rebuilt on every render while loading.
const noNeighbors: Neighbor[] = [];

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
  const locationQuery = useMyLocation();
  const location = locationQuery.data;
  const nearby = useNearby(
    !!location?.consented && location.lat !== null && location.lng !== null,
  );
  const neighbors = nearby.data;
  const consent = useChangeLocationConsent();
  const update = useUpdateMyLocation();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const pending = consent.isPending || update.isPending;
  const error =
    consent.error?.message ??
    update.error?.message ??
    locationQuery.error?.message;
  const nearbyError = nearby.error?.message;

  const changeConsent = (consented: boolean) => {
    if (
      !consented &&
      !window.confirm("위치 공개를 끌까요? 저장한 위치도 지워져요.")
    )
      return;
    update.reset();
    consent.mutate(consented, { onSuccess: () => setSelectedId(null) });
  };

  const updateLocation = () => {
    consent.reset();
    update.mutate(undefined, { onSuccess: () => setSelectedId(null) });
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
          onClick={() => changeConsent(true)}
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
        onClick={() => updateLocation()}
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
        onClick={() => changeConsent(false)}
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
            (neighbors === undefined ? (
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
