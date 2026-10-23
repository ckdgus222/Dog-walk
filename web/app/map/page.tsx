"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "../_components/auth-gate";
import { PinIcon } from "../_components/icons";
import headingStyles from "../_components/heading.module.css";
import layoutStyles from "../_components/layout.module.css";
import {
  useChangeLocationConsent,
  useMyLocation,
  useNearby,
  useUpdateMyLocation,
} from "../../lib/api/location";
import type { MyLocation, Neighbor } from "../../lib/types";
import KakaoMap from "./kakao-map";
import { NeighborList } from "./neighbor-list";
import { NeighborDetail } from "./neighbor-detail";
import styles from "./map.module.css";

// Keep marker inputs stable while the nearby list is unavailable.
const noNeighbors: Neighbor[] = [];

const MapPage = () => {
  return (
    <main className={`${layoutStyles.main} ${styles.page}`}>
      <div className={styles.head}>
        <h1 className={headingStyles.title}>내 주변 산책 친구</h1>
        <p className={headingStyles.lead}>
          지금 이 근처에서 함께 산책할 수 있는 이웃을 찾아보세요.
        </p>
      </div>
      <AuthGate>
        <LocationPanel />
      </AuthGate>
    </main>
  );
};
export default MapPage;

const LocationPanel = () => {
  const locationQuery = useMyLocation();
  const location = locationQuery.data;
  const queryClient = useQueryClient();
  const consent = useChangeLocationConsent();
  const { mutateAsync: sendLocation } = useUpdateMyLocation();
  const sending = useRef<AbortController | null>(null);
  const [sentWhileVisible, setSentWhileVisible] = useState(false);
  const [mapStarted, setMapStarted] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const canSend = !!location?.consented && !consent.isPending;
  const nearby = useNearby(canSend && sentWhileVisible);
  const neighbors =
    canSend && sentWhileVisible && !nearby.isError ? nearby.data : undefined;
  const error =
    consent.error?.message ?? sendError ?? locationQuery.error?.message;
  const nearbyError = nearby.error?.message;

  // A layout effect, because Next.js hides this page with Activity when
  // navigating away. Only a layout cleanup resets the list before it is
  // hidden; a passive one lets the old list flash when the page comes back.
  useLayoutEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let active = true;
    const stop = () => {
      clearInterval(timer);
      sending.current?.abort();
      sending.current = null;
      setSentWhileVisible(false);
      setSelectedId(null);
      void queryClient.cancelQueries({ queryKey: ["location", "nearby"] });
      queryClient.removeQueries({ queryKey: ["location", "nearby"] });
    };
    const send = async () => {
      if (
        !active ||
        !canSend ||
        document.visibilityState === "hidden" ||
        sending.current
      )
        return;
      const controller = new AbortController();
      sending.current = controller;
      const previous = queryClient.getQueryData<MyLocation>(["location", "me"]);
      try {
        const saved = await sendLocation(controller.signal);
        if (!saved || controller.signal.aborted || !active) return;
        if (previous?.lat !== saved.lat || previous?.lng !== saved.lng) {
          setSelectedId(null);
        }
        setSendError(null);
        setMapStarted(true);
        setSentWhileVisible(true);
      } catch (error) {
        if (!controller.signal.aborted && active) {
          setSendError(
            error instanceof Error ? error.message : "위치를 보내지 못했어요.",
          );
        }
      } finally {
        if (sending.current === controller) sending.current = null;
      }
    };
    const visibilityChanged = () => {
      stop();
      if (canSend && document.visibilityState !== "hidden") {
        void send();
        timer = setInterval(() => void send(), 60_000);
      }
    };
    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", visibilityChanged);
      stop();
    };
  }, [canSend, queryClient, sendLocation]);

  const changeConsent = (consented: boolean) => {
    if (
      !consented &&
      !window.confirm("위치 공개를 끌까요? 저장한 위치도 지워져요.")
    )
      return;
    sending.current?.abort();
    setSendError(null);
    setSentWhileVisible(false);
    setSelectedId(null);
    consent.mutate(consented);
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
      <div className={styles.consent}>
        {error && <p role="alert">{error}</p>}
        <p>
          지도 화면을 보고 있는 동안 내 위치를 약 200m 단위로 흐려서 1분마다
          저장하고, 주변 사용자에게 보여 줘요. 화면을 닫거나 다른 탭으로 가면
          5분 뒤 보이지 않아요. 마지막 위치는 공개를 끄거나 로그아웃할 때까지
          보관돼요. 공개는 언제든 끌 수 있고, 로그아웃하면 함께 꺼져요.
        </p>
        <button
          type="button"
          disabled={consent.isPending}
          onClick={() => changeConsent(true)}
        >
          동의하고 위치 공개
        </button>
      </div>
    );
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className={styles.status}>
        <span className={styles.live}>
          <PinIcon />
          위치 공개 중
        </span>
        <button
          type="button"
          disabled={consent.isPending}
          onClick={() => changeConsent(false)}
        >
          위치 공개 끄기
        </button>
        {location.updatedAt && (
          <p>
            마지막 업데이트{" "}
            <time dateTime={location.updatedAt}>
              {new Date(location.updatedAt).toLocaleString("ko-KR", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
          </p>
        )}
      </div>
      {mapStarted && location.lat !== null && location.lng !== null && (
        <KakaoMap
          lat={location.lat}
          lng={location.lng}
          neighbors={neighbors ?? noNeighbors}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}
      <div className={styles.columns}>
        {!sentWhileVisible ? (
          <p role="status">내 위치를 받아 오고 있어요.</p>
        ) : nearbyError ? (
          <p role="alert">{nearbyError}</p>
        ) : neighbors === undefined ? (
          <p role="status">주변 사용자를 불러오고 있어요.</p>
        ) : (
          <NeighborList
            neighbors={neighbors}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
        {selected && <NeighborDetail neighbor={selected} />}
      </div>
    </>
  );
};
