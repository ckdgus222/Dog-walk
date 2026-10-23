"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { Neighbor } from "../../lib/types";
import { dogFaceSrc } from "../_components/dog-card";
import { InfoIcon } from "../_components/icons";
import styles from "./map.module.css";

type MapPoint = object;
type MapInstance = object;
type MapOverlay = {
  setMap(map: MapInstance | null): void;
  setPosition(position: MapPoint): void;
  setZIndex(zIndex: number): void;
};
type KakaoMaps = {
  load(callback: () => void): void;
  LatLng: new (lat: number, lng: number) => MapPoint;
  Map: new (
    container: HTMLElement,
    options: { center: MapPoint; level: number },
  ) => MapInstance;
  CustomOverlay: new (options: {
    map: MapInstance;
    position: MapPoint;
    content: HTMLElement;
    xAnchor?: number;
    yAnchor?: number;
    clickable?: boolean;
    zIndex?: number;
  }) => MapOverlay;
};

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
};

// The overlays are drawn for mouse users only. They are hidden from screen
// readers, which choose a neighbor from the list beside the map instead.
const neighborOverlay = (neighbor: Neighbor) => {
  const root = element("div", styles.marker);
  root.setAttribute("aria-hidden", "true");
  const face = element("img", styles.markerFace);
  face.alt = "";
  if (neighbor.dogs[0]) face.src = dogFaceSrc(neighbor.dogs[0], 80);
  const label = element("div", styles.markerLabel);
  label.append(
    element("strong", "", neighbor.nickname),
    element("span", "", `약 ${neighbor.distanceM}m`),
  );
  root.append(face, label);
  return root;
};

const ownOverlay = () => {
  const root = element("div", styles.me);
  root.setAttribute("aria-hidden", "true");
  root.append(element("span", styles.meDot), element("span", styles.meLabel, "내 위치"));
  return root;
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
  selectedId,
  onSelect,
}: {
  lat: number;
  lng: number;
  neighbors: Neighbor[];
  selectedId: number | null;
  onSelect: (userId: number) => void;
}) => {
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [initialCenter] = useState({ lat, lng });
  const map = useRef<MapInstance | null>(null);
  const overlays = useRef(
    new Map<number, { overlay: MapOverlay; content: HTMLElement }>(),
  );
  const ownMarker = useRef<MapOverlay | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!ready) return;
    const element = container.current;
    const maps = window.kakao?.maps;
    let cancelled = false;
    if (!maps || !element) {
      setFailed(true);
      return;
    }
    maps.load(() => {
      if (cancelled) return;
      try {
        const center = new maps.LatLng(initialCenter.lat, initialCenter.lng);
        map.current = new maps.Map(element, { center, level: 5 });
        ownMarker.current = new maps.CustomOverlay({
          map: map.current,
          position: center,
          content: ownOverlay(),
          yAnchor: 0.5,
        });
        setMapReady(true);
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      ownMarker.current?.setMap(null);
      ownMarker.current = null;
      map.current = null;
      element.replaceChildren();
    };
  }, [ready, initialCenter]);

  useEffect(() => {
    const maps = window.kakao?.maps;
    if (!mapReady || !maps) return;
    ownMarker.current?.setPosition(new maps.LatLng(lat, lng));
  }, [mapReady, lat, lng]);

  useEffect(() => {
    const maps = window.kakao?.maps;
    const instance = map.current;
    if (!mapReady || !maps || !instance) return;
    const drawn = overlays.current;
    for (const neighbor of neighbors) {
      const content = neighborOverlay(neighbor);
      content.addEventListener("click", () => onSelect(neighbor.userId));
      const overlay = new maps.CustomOverlay({
        map: instance,
        position: new maps.LatLng(neighbor.lat, neighbor.lng),
        content,
        xAnchor: 0.2,
        yAnchor: 0.5,
        clickable: true,
        zIndex: 1,
      });
      drawn.set(neighbor.userId, { overlay, content });
    }
    return () => {
      for (const { overlay } of drawn.values()) overlay.setMap(null);
      drawn.clear();
    };
  }, [mapReady, neighbors, onSelect]);

  // Choosing a neighbor only restyles the overlays, without redrawing them.
  useEffect(() => {
    for (const [userId, { overlay, content }] of overlays.current) {
      const selected = userId === selectedId;
      content.classList.toggle(styles.markerSelected, selected);
      overlay.setZIndex(selected ? 2 : 1);
    }
  }, [selectedId, neighbors, mapReady]);

  if (!key || failed)
    return <p className={styles.mapFallback}>지도를 불러오지 못했어요.</p>;

  return (
    <>
      <Script
        src={`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`}
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
      />
      <div className={styles.mapFrame}>
        <div
          ref={container}
          className={styles.map}
          aria-label="내 위치와 주변 사용자 지도"
        />
        <p className={styles.mapNote}>
          <InfoIcon />
          위치는 약 200m 단위로 표시돼요.
        </p>
      </div>
    </>
  );
};
export default KakaoMap;
