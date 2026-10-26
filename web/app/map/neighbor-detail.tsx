import type { Neighbor } from "../../lib/types";
import { DogCard } from "../_components/dog-card";
import uiStyles from "../_components/ui.module.css";
import { SendWalkRequest } from "./send-walk-request";
import styles from "./map.module.css";

// The owner's name and distance sit beside the first dog's picture, as in the
// mockup; any further dogs follow underneath. The section scrolls and the card
// inside it does not: a card's drawn outline is pinned to the box it sits on,
// so on a scrolling card it would slide over the request form.
export const NeighborDetail = ({ neighbor }: { neighbor: Neighbor }) => (
  <section aria-label={`${neighbor.nickname}의 반려견`}>
    <div className={`${uiStyles.card} ${styles.selected}`}>
      <h2>{neighbor.nickname}</h2>
      <p className={styles.distance}>약 {neighbor.distanceM}m</p>
      {neighbor.dogs.map((dog) => (
        <DogCard
          key={dog.id}
          dog={dog}
          heading="h3"
          className={styles.dog}
          separator="|"
        />
      ))}
      <SendWalkRequest key={neighbor.userId} receiverId={neighbor.userId} />
    </div>
  </section>
);
