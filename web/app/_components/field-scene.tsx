import Image from "next/image";
import bamiRun1 from "../../public/illustrations/walking-drawing/intro/bami-run-1.png";
import bamiRun2 from "../../public/illustrations/walking-drawing/intro/bami-run-2.png";
import cloud1 from "../../public/illustrations/walking-drawing/intro/cloud-1.png";
import cloud2 from "../../public/illustrations/walking-drawing/intro/cloud-2.png";
import cloud3 from "../../public/illustrations/walking-drawing/intro/cloud-3.png";
import dubuRun1 from "../../public/illustrations/walking-drawing/intro/dubu-run-1.png";
import dubuRun2 from "../../public/illustrations/walking-drawing/intro/dubu-run-2.png";
import field from "../../public/illustrations/walking-drawing/intro/field.png";
import grassFront from "../../public/illustrations/walking-drawing/intro/grass-front.png";
import hills from "../../public/illustrations/walking-drawing/intro/hills.png";
import styles from "./field-scene.module.css";

const clouds = [cloud1, cloud2, cloud3];
// The ground layers share one frame, so they line up at every width.
const groundLayers = [
  { image: hills, className: styles.hills },
  { image: field, className: styles.field },
  { image: grassFront, className: styles.grass },
];
const dogs = [
  { name: "bami", frames: [bamiRun1, bamiRun2] },
  { name: "dubu", frames: [dubuRun1, dubuRun2] },
];

// The sky, clouds, field and running dogs behind the first-visit intro and
// the guest home. Both draw the same layers in the same places, so the intro
// fades straight into the home; each variant only moves them differently.
export const FieldScene = ({ variant }: { variant: "intro" | "home" }) => (
  <div aria-hidden="true" className={`${styles.scene} ${styles[variant]}`}>
    <div className={`${styles.sky} ${styles.layer}`} />
    {clouds.map((cloud, index) => (
      <div
        key={cloud.src}
        className={`${styles.cloud} ${styles[`cloud${index + 1}`]} ${styles.layer}`}
      >
        {/* sizes follows the .cloud widths in field-scene.module.css. */}
        <Image
          src={cloud}
          alt=""
          sizes="(max-width: 750px) 150px, (max-width: 1600px) 20vw, 320px"
        />
      </div>
    ))}
    <div
      className={styles.ground}
      style={{ aspectRatio: `${hills.width} / ${hills.height}` }}
    >
      {groundLayers.map(({ image, className }) => (
        <div key={image.src} className={`${className} ${styles.layer}`}>
          {/* The ground is the first thing a guest sees on the home, so it
              loads at once there; the intro's copy stays lazy, as it is
              hidden for anyone who has seen it. */}
          <Image
            src={image}
            alt=""
            fill
            sizes="max(100vw, 180vh)"
            loading={variant === "home" ? "eager" : undefined}
          />
        </div>
      ))}
    </div>
    {dogs.map(({ name, frames }) => (
      <div
        key={name}
        className={`${styles.dog} ${styles[name]}`}
        style={{ aspectRatio: `${frames[0].width} / ${frames[0].height}` }}
      >
        <div className={styles.body}>
          {frames.map((frame) => (
            // sizes follows the .dog widths in field-scene.module.css.
            <Image
              key={frame.src}
              src={frame}
              alt=""
              fill
              sizes="(max-width: 867px) 130px, (max-width: 1467px) 15vw, 220px"
            />
          ))}
        </div>
      </div>
    ))}
  </div>
);
