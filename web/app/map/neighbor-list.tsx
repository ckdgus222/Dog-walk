import type { Neighbor } from "../../lib/types";
import { EmptyState } from "../_components/empty-state";
import { ChevronRight } from "../_components/icons";
import { PersonFace } from "../_components/person-face";
import uiStyles from "../_components/ui.module.css";
import walkScene from "../../public/illustrations/walking-drawing/walk-scene.png";
import styles from "./map.module.css";

export const NeighborList = ({
  neighbors,
  selectedId,
  onSelect,
}: {
  neighbors: Neighbor[];
  selectedId: number | null;
  onSelect: (userId: number) => void;
}) => (
  <section aria-label="주변 산책 친구" className={styles.neighborList}>
    <h2>1km 이내 이웃 {neighbors.length}명</h2>
    {neighbors.length === 0 && (
      <EmptyState
        image={walkScene}
        title="1km 안에 아직 아무도 없어요."
        description="이웃이 지도를 열면 여기에 나타나요. 위치 공개는 켜 둔 채로 기다려 주세요."
      />
    )}
    {neighbors.length > 0 && (
      <ul className={`${uiStyles.list} ${styles.neighbors}`}>
        {neighbors.map((neighbor) => (
          <li key={neighbor.userId} className={uiStyles.listRow}>
            <button
              type="button"
              onClick={() => onSelect(neighbor.userId)}
              aria-pressed={selectedId === neighbor.userId}
            >
              <PersonFace userId={neighbor.userId} size={48} />
              <strong>{neighbor.nickname}</strong>
              <span className={styles.distance}>
                약 {neighbor.distanceM}m
                <ChevronRight size={16} />
              </span>
              <span className={`${uiStyles.meta} ${styles.dogNames}`}>
                {neighbor.dogs
                  .map((dog) => `${dog.name} · ${dog.breed}`)
                  .join(", ")}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);
