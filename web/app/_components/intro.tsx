"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { FieldScene } from "./field-scene";
import styles from "./intro.module.css";
import { INTRO_SEEN_KEY } from "./intro-seen";

const INTRO_DURATION_MS = 6000;

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
      <FieldScene variant="intro" />
      <div aria-hidden="true" className={`${styles.title} ${styles.reveal}`}>
        <strong>강아지 산책</strong>
        <span>오늘도, 좋은 산책이 기다리고 있어요</span>
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
