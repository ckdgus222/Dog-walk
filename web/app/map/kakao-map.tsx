"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import styles from "./map.module.css";

type MapPoint = object;
type MapInstance = object;
type MapMarker = { setMap(map: MapInstance | null): void };
type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => MapPoint;
  Map: new (
    container: HTMLElement,
    options: { center: MapPoint; level: number },
  ) => MapInstance;
  Marker: new (options: {
    map: MapInstance;
    position: MapPoint;
    title: string;
  }) => MapMarker;
  event: {
    addListener(marker: MapMarker, event: "click", callback: () => void): void;
  };
};

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

const KakaoMap = ({
  lat,
  lng,
  neighbors,
  onSelect,
}: {
  lat: number;
  lng: number;
  neighbors: { userId: number; nickname: string; lat: number; lng: number }[];
  onSelect: (userId: number) => void;
}) => {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const element = container.current;
    const maps = window.kakao?.maps;
    let cancelled = false;
    const markers: MapMarker[] = [];
    if (!maps || !element) {
      setFailed(true);
      return;
    }
    maps.load(() => {
      if (cancelled) return;
      try {
        const center = new maps.LatLng(lat, lng);
        const map = new maps.Map(element, { center, level: 5 });
        markers.push(
          new maps.Marker({ map, position: center, title: "내 위치" }),
        );
        for (const neighbor of neighbors) {
          const marker = new maps.Marker({
            map,
            position: new maps.LatLng(neighbor.lat, neighbor.lng),
            title: neighbor.nickname,
          });
          maps.event.addListener(marker, "click", () =>
            onSelect(neighbor.userId),
          );
          markers.push(marker);
        }
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      for (const marker of markers) marker.setMap(null);
      element.replaceChildren();
    };
  }, [ready, lat, lng, neighbors, onSelect]);

  if (!key || failed)
    return <p className={styles.mapFallback}>지도를 불러오지 못했어요.</p>;

  return (
    <>
      <Script
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`}
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <div
        ref={container}
        className={styles.map}
        aria-label="내 위치와 주변 사용자 지도"
      />
    </>
  );
};
export default KakaoMap;
