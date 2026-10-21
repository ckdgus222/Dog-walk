"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch, responseError } from "../../lib/auth";
import { useNotifications } from "./notifications-provider";
import type { WalkRequest } from "../../lib/types";
import { sizeLabels } from "./dog-card";
import styles from "./notifications.module.css";

export const WalkRequestModal = () => {
  const { incoming } = useNotifications();
  return incoming ? (
    <IncomingRequest key={incoming.id} request={incoming} />
  ) : null;
};

const IncomingRequest = ({ request }: { request: WalkRequest }) => {
  const { dismissIncoming, refreshRequests } = useNotifications();
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current;
    active.current = true;
    element?.showModal();
    return () => {
      active.current = false;
      element?.close();
    };
  }, []);

  const respond = async (action: "accept" | "reject") => {
    setPending(true);
    setError("");
    try {
      const response = await apiFetch(
        `/api/walk-requests/${request.id}/${action}`,
        { method: "PATCH" },
      );
      if (!response.ok) throw await responseError(response);
      refreshRequests();
      if (active.current) dismissIncoming();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "요청을 처리하지 못했어요.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-title"
      className={styles.dialog}
      onCancel={dismissIncoming}
    >
      <h2 id="incoming-title">{request.counterpart.nickname}님의 산책 요청</h2>
      <ul>
        {request.counterpart.dogs.map((dog) => (
          <li key={dog.id}>
            {dog.name} · {dog.breed} · {sizeLabels[dog.size]}
          </li>
        ))}
      </ul>
      {request.message && <p>{request.message}</p>}
      {error && <p role="alert">{error}</p>}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={pending}
          onClick={() => void respond("accept")}
        >
          수락
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => void respond("reject")}
        >
          거절
        </button>
        <button type="button" onClick={dismissIncoming}>
          닫기
        </button>
      </div>
    </dialog>
  );
};
