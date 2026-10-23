import { getImageProps, type StaticImageData } from "next/image";
import styles from "./walk-scene.module.css";

// One decorative drawing framed for wide screens and another for narrow
// ones. The browser downloads only the one that matches `narrowMedia`; the
// page places it with `className`. Pages whose narrow drawing waits under a
// long form load it lazily.
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
