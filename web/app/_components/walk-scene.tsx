import { getImageProps, type StaticImageData } from "next/image";
import styles from "./walk-scene.module.css";

// A page whose content sits over a walk drawing. The content keeps its own
// width and spacing through `className`; `scene` is the drawing, placed after
// the content as a band unless the page moves it with its own class.
export const ScenePage = ({
  className,
  scene,
  children,
}: {
  className: string;
  scene: React.ReactNode;
  children: React.ReactNode;
}) => (
  <main className={styles.page}>
    <div className={`${styles.content} ${className}`}>{children}</div>
    {scene}
  </main>
);

// One decorative drawing framed for wide screens and another for narrow
// ones. The browser downloads only the one that matches `narrowMedia`. A
// page's `className` can move the drawing out of its band. Pages whose
// narrow drawing waits under a long form load it lazily.
export const SceneImage = ({
  wide,
  narrow,
  narrowMedia,
  wideSizes,
  className = "",
  loading = "eager",
}: {
  wide: StaticImageData;
  narrow: StaticImageData;
  narrowMedia: string;
  wideSizes: string;
  className?: string;
  loading?: "eager" | "lazy";
}) => {
  const {
    props: { srcSet: narrowSrcSet },
  } = getImageProps({ src: narrow, alt: "", sizes: "100vw" });
  const { props } = getImageProps({
    src: wide,
    alt: "",
    sizes: wideSizes,
    loading,
  });
  return (
    <picture className={`${styles.scene} ${className}`}>
      <source
        media={narrowMedia}
        srcSet={narrowSrcSet}
        sizes="100vw"
        width={narrow.width}
        height={narrow.height}
      />
      <img {...props} alt="" />
    </picture>
  );
};
