"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import styles from "./auth-modal.module.css";
import { CloseIcon } from "./icons";

export const AuthModal = ({
  title,
  pending,
  wide = false,
  children,
}: {
  title: string;
  pending: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) => {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const close = () => {
    if (pending) return;
    router.back();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={title}
      className={`${styles.dialog} ${wide ? styles.wide : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom;
        if (outside) close();
      }}
    >
      <button
        className={styles.close}
        type="button"
        aria-label="닫기"
        disabled={pending}
        onClick={close}
      >
        <CloseIcon />
      </button>
      {children}
    </dialog>
  );
};
