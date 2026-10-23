import type { Neighbor } from "../../lib/types";
import { DogCard } from "../_components/dog-card";
import { SendWalkRequest } from "./send-walk-request";
import styles from "./map.module.css";

export const NeighborDetail = ({ neighbor }: { neighbor: Neighbor }) => (
  <section
    className={styles.selected}
    aria-label={`${neighbor.nickname}의 반려견`}
  >
    <h2>{neighbor.nickname}</h2>
    <p className={styles.distance}>약 {neighbor.distanceM}m</p>
    <div className={styles.dogs}>
      {neighbor.dogs.map((dog) => (
        <DogCard key={dog.id} dog={dog} heading="h3" className={styles.dog} />
      ))}
    </div>
    <SendWalkRequest key={neighbor.userId} receiverId={neighbor.userId} />
  </section>
);
