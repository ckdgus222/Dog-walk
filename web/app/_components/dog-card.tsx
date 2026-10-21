import type { Dog } from "../../lib/types";
import styles from "./shared.module.css";

export const sizeLabels = { SMALL: "소형", MEDIUM: "중형", LARGE: "대형" };

export const DogCard = ({
  dog,
  heading: Heading,
  children,
}: {
  dog: Dog;
  heading: "h2" | "h3";
  children?: React.ReactNode;
}) => (
  <article className={styles.card}>
    {dog.photoUrl ? (
      // The web container cannot fetch nginx uploads for next/image optimization.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={styles.photo}
        src={dog.photoUrl}
        alt={`${dog.name} 사진`}
      />
    ) : (
      <p>사진 없음</p>
    )}
    <Heading>{dog.name}</Heading>
    <p>
      {dog.breed} · {sizeLabels[dog.size]} ·{" "}
      {dog.gender === "MALE" ? "수컷" : "암컷"}
    </p>
    <p>
      {dog.neutered ? "중성화했어요" : "중성화하지 않았어요"} ·{" "}
      {dog.birthYear}년생
    </p>
    <p>{dog.personality}</p>
    {children}
  </article>
);
