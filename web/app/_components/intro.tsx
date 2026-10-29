"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { FieldScene } from "./field-scene";
import styles from "./intro.module.css";
import { INTRO_SEEN_KEY } from "./intro-seen";

// The scene's timeline in intro.module.css and field-scene.module.css is
// written for this length.
const INTRO_DURATION_MS = 8000;
const INTRO_TITLE = "옆집 강아지에 오신 걸 환영해요";
// Narrow screens wrap the title between words only. Letters keep counting
// across words, spaces included, so they still pop in turn.
const INTRO_WORDS = INTRO_TITLE.split(" ").map((word, index, words) => ({
  letters: [...word],
  start: words
    .slice(0, index)
    .reduce((count, earlier) => count + [...earlier].length + 1, 0),
}));

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
        {/* Paw prints that blink one after another, like steps. */}
        <div className={styles.paws}>
          <span />
          <span />
          <span />
          <span />
        </div>
        {/* Each letter pops up in turn. */}
        <strong>
          {INTRO_WORDS.map(({ letters, start }, wordIndex) => (
            <Fragment key={wordIndex}>
              {wordIndex > 0 && " "}
              <span className={styles.word}>
                {letters.map((letter, offset) => (
                  <span
                    key={offset}
                    style={{ "--letter": start + offset } as CSSProperties}
                  >
                    {letter}
                  </span>
                ))}
              </span>
            </Fragment>
          ))}
        </strong>
        <span>가까운 이웃과 우리 아이의 산책 친구를 만나 보세요</span>
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
