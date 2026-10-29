"use client";

import Image from "next/image";
import { useLayoutEffect } from "react";
import bamiRun1 from "../../public/illustrations/walking-drawing/intro/bami-run-1.png";
import bamiRun2 from "../../public/illustrations/walking-drawing/intro/bami-run-2.png";
import bamiSniff from "../../public/illustrations/walking-drawing/intro/bami-sniff.png";
import bamiStand1 from "../../public/illustrations/walking-drawing/intro/bami-stand-1.png";
import bamiStand2 from "../../public/illustrations/walking-drawing/intro/bami-stand-2.png";
import cloud1 from "../../public/illustrations/walking-drawing/intro/cloud-1.png";
import cloud2 from "../../public/illustrations/walking-drawing/intro/cloud-2.png";
import cloud3 from "../../public/illustrations/walking-drawing/intro/cloud-3.png";
import dubuRun1 from "../../public/illustrations/walking-drawing/intro/dubu-run-1.png";
import dubuRun2 from "../../public/illustrations/walking-drawing/intro/dubu-run-2.png";
import dubuSniff from "../../public/illustrations/walking-drawing/intro/dubu-sniff.png";
import dubuStand1 from "../../public/illustrations/walking-drawing/intro/dubu-stand-1.png";
import dubuStand2 from "../../public/illustrations/walking-drawing/intro/dubu-stand-2.png";
import dubuTurn from "../../public/illustrations/walking-drawing/intro/dubu-turn.png";
import field from "../../public/illustrations/walking-drawing/intro/field.png";
import grassFront from "../../public/illustrations/walking-drawing/intro/grass-front.png";
import heart from "../../public/illustrations/walking-drawing/intro/heart.png";
import hills from "../../public/illustrations/walking-drawing/intro/hills.png";
import styles from "./field-scene.module.css";

const clouds = [cloud1, cloud2, cloud3];
// The ground layers share one frame, so they line up at every width.
const groundLayers = [
  { image: hills, className: styles.hills },
  { image: field, className: styles.field },
  { image: grassFront, className: styles.grass },
];
// Follows the .dog widths in field-scene.module.css.
const dogSizes = "(max-width: 867px) 130px, (max-width: 1467px) 15vw, 220px";
// The poses play the intro's meeting; each key is its class in
// field-scene.module.css.
const dogs = [
  {
    name: "bami",
    frames: [bamiRun1, bamiRun2],
    poses: { stand1: bamiStand1, stand2: bamiStand2, sniff: bamiSniff },
  },
  {
    name: "dubu",
    frames: [dubuRun1, dubuRun2],
    poses: {
      stand1: dubuStand1,
      stand2: dubuStand2,
      sniff: dubuSniff,
      turn: dubuTurn,
    },
  },
];

// The sky, clouds, field and running dogs behind the first-visit intro and
// every page ("home"). Both draw the same layers in the same places, so the
// intro fades straight into the page; each variant only moves them
// differently.
export const FieldScene = ({ variant }: { variant: "intro" | "home" }) => (
  <div aria-hidden="true" className={`${styles.scene} ${styles[variant]}`}>
    <div className={styles.sky} />
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
          {/* The ground is the first thing seen behind every page, so it
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
    {dogs.map(({ name, frames, poses }) => (
      <div
        key={name}
        className={`${styles.dog} ${styles[name]}`}
        style={{ aspectRatio: `${frames[0].width} / ${frames[0].height}` }}
      >
        <div className={styles.body}>
          {frames.map((frame) => (
            <Image
              key={frame.src}
              src={frame}
              alt=""
              fill
              sizes={dogSizes}
              className={styles.run}
            />
          ))}
          {variant === "intro" &&
            Object.entries(poses).map(([pose, image]) => (
              <Image
                key={pose}
                src={image}
                alt=""
                fill
                sizes={dogSizes}
                className={styles[pose]}
              />
            ))}
        </div>
      </div>
    ))}
    {variant === "intro" && (
      // Floats up between the two dogs as they wag their tails.
      <Image
        src={heart}
        alt=""
        width={44}
        height={44}
        className={styles.heart}
      />
    )}
  </div>
);

// The background's dogs run on the home only. The mark sits on <body> while
// the calling page is shown, not on the page itself: pages left behind are
// kept hidden in the document, and a mark inside them would still match.
export const useFieldSceneDogs = () => {
  useLayoutEffect(() => {
    document.body.dataset.homeScene = "";
    return () => {
      delete document.body.dataset.homeScene;
    };
  }, []);
};
