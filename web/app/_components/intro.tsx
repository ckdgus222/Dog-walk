"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
import styles from "./intro.module.css";
import { INTRO_SEEN_KEY } from "./intro-seen";

const INTRO_DURATION_MS = 6000;
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

export const Intro = () => {
  const [dismissed, setDismissed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    document.documentElement.dataset.intro = "done";
    dialogRef.current?.close();
    setDismissed(true);
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.intro === "done") {
      // CSS already hides the server markup; remove it after this effect.
      queueMicrotask(finish);
      return;
    }

    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      queueMicrotask(finish);
      return;
    }

    const dialog = dialogRef.current;
    html.dataset.intro = "playing";
    // Focus moves to the skip button, the only control in the dialog.
    dialog?.showModal();
    timerRef.current = setTimeout(finish, INTRO_DURATION_MS);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      // Strict Mode also runs cleanup before setting up the effect again.
      dialog?.close();
    };
  }, [finish]);

  if (dismissed) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label="인트로"
      className={styles.intro}
      style={{ "--intro-duration": `${INTRO_DURATION_MS}ms` } as CSSProperties}
      onCancel={(event) => {
        event.preventDefault();
        finish();
      }}
    >
      <div aria-hidden="true">
        <div className={`${styles.sky} ${styles.reveal}`} />
        {clouds.map((cloud, index) => (
          <div
            key={cloud.src}
            className={`${styles.cloud} ${styles[`cloud${index + 1}`]} ${styles.reveal}`}
          >
            {/* sizes follows the .cloud widths in intro.module.css. */}
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
            <div key={image.src} className={`${className} ${styles.reveal}`}>
              <Image src={image} alt="" fill sizes="max(100vw, 180vh)" />
            </div>
          ))}
        </div>
        <div className={`${styles.title} ${styles.reveal}`}>
          <strong>강아지 산책</strong>
          <span>오늘도, 좋은 산책이 기다리고 있어요</span>
        </div>
        {dogs.map(({ name, frames }) => (
          <div
            key={name}
            className={`${styles.dog} ${styles[name]}`}
            style={{ aspectRatio: `${frames[0].width} / ${frames[0].height}` }}
          >
            <div className={styles.body}>
              {frames.map((frame) => (
                // sizes follows the .dog widths in intro.module.css.
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
      <button
        type="button"
        className={`${styles.skip} ${styles.reveal}`}
        onClick={finish}
      >
        건너뛰기
      </button>
    </dialog>
  );
};
