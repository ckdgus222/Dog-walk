import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowRight } from "./icons";
import layoutStyles from "./layout.module.css";
import styles from "./empty-state.module.css";

// What a list shows when it has nothing yet: an optional drawing, the empty
// message, a hint and an optional next step.
export const EmptyState = ({
  image,
  title,
  description,
  action,
}: {
  image?: StaticImageData;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) => (
  <div className={styles.empty}>
    {image && (
      // sizes follows the drawing height (180px, 120px on phones) for the
      // widest drawing (3:1); SVG drawings ignore it.
      <Image
        className={styles.image}
        src={image}
        alt=""
        sizes="(max-width: 720px) 360px, 540px"
      />
    )}
    <p className={styles.title}>{title}</p>
    <p className={styles.description}>{description}</p>
    {action && (
      <Link
        href={action.href}
        className={`${layoutStyles.headAction} ${styles.action}`}
      >
        {action.label}
        <ArrowRight />
      </Link>
    )}
  </div>
);
