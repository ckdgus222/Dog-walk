"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { Dog, Neighbor } from "../../lib/types";
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
const markerElement = (className: string, title: string, detail?: string) => {
  const root = element("div", className);
  root.setAttribute("aria-hidden", "true");
  const face = element("img", styles.markerFace);
  face.alt = "";
  const label = element("div", styles.markerLabel);
  label.append(element("strong", "", title));
  if (detail) label.append(element("span", "", detail));
  root.append(face, label);
  return { root, face };
};

const neighborOverlay = (neighbor: Neighbor) => {
  const { root, face } = markerElement(
    styles.marker,
    neighbor.nickname,
    `약 ${neighbor.distanceM}m`,
  );
  if (neighbor.dogs[0]) face.src = dogFaceSrc(neighbor.dogs[0], 80);
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
  myDog,
  neighbors,
  selectedId,
  onSelect,
}: {
  lat: number;
  lng: number;
  myDog: Dog | undefined;
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
  const ownFace = useRef<HTMLImageElement | null>(null);
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
        // Drawn like a neighbor; the face stays empty until my dogs arrive.
        const own = markerElement(`${styles.marker} ${styles.me}`, "내 위치");
        ownFace.current = own.face;
        ownMarker.current = new maps.CustomOverlay({
          map: map.current,
          position: center,
          content: own.root,
          xAnchor: 0.5,
          yAnchor: 1,
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
      ownFace.current = null;
      map.current = null;
      element.replaceChildren();
    };
  }, [ready, initialCenter]);

  useEffect(() => {
    const maps = window.kakao?.maps;
    if (!mapReady || !maps) return;
    ownMarker.current?.setPosition(new maps.LatLng(lat, lng));
  }, [mapReady, lat, lng]);

  // The map and my dogs load separately; fill the face once both are there.
  // Order 0 picks the same drawing as my first dog on the home page.
  useEffect(() => {
    if (!mapReady || !myDog || !ownFace.current) return;
    ownFace.current.src = dogFaceSrc(myDog, 80, 0);
  }, [mapReady, myDog]);

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
        // The tail tip, at the bottom center of the face and tail.
        xAnchor: 0.5,
        yAnchor: 1,
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
