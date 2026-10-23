import Image from "next/image";
import walkScene from "../../public/illustrations/walking-drawing/walk-scene.png";
import styles from "./walk-scene.module.css";

// A page that ends with the walk drawing. The content keeps its own width and
// spacing through `className`.
export const ScenePage = ({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) => (
  <main className={styles.page}>
    <div className={`${styles.content} ${className}`}>{children}</div>
    {/* Phones show the drawing in a 2:1 frame, about 150% of the screen width. */}
    <Image
      className={styles.scene}
      src={walkScene}
      alt=""
      sizes="(max-width: 720px) 150vw, (max-width: 1600px) 100vw, 1600px"
      loading="eager"
    />
  </main>
);
