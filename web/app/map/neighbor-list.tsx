import type { Neighbor } from "../../lib/types";
import { DogFace } from "../_components/dog-card";
import { ChevronRight } from "../_components/icons";
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
    {neighbors.length === 0 && <p>1km 안에 아직 아무도 없어요.</p>}
    <ul className={styles.neighbors}>
      {neighbors.map((neighbor) => (
        <li key={neighbor.userId}>
          <button
            type="button"
            onClick={() => onSelect(neighbor.userId)}
            aria-pressed={selectedId === neighbor.userId}
          >
            {neighbor.dogs[0] && (
              <DogFace
                dog={neighbor.dogs[0]}
                className={styles.neighborFace}
                size={66}
              />
            )}
            <strong>{neighbor.nickname}</strong>
            <span className={styles.distance}>약 {neighbor.distanceM}m</span>
            <span className={styles.dogNames}>
              {neighbor.dogs
                .map((dog) => `${dog.name} · ${dog.breed}`)
                .join(", ")}
            </span>
            <ChevronRight />
          </button>
        </li>
      ))}
    </ul>
  </section>
);
