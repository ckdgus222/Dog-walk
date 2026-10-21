"use client";

import { useEffect, useRef } from "react";
import { useRespondToWalkRequest } from "../../lib/api/walk-requests";
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
  const { dismissIncoming } = useNotifications();
  const dialog = useRef<HTMLDialogElement>(null);
  const respondMutation = useRespondToWalkRequest();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
    };
  }, []);

  const respond = (action: "accept" | "reject") => {
    respondMutation.mutate(
      { id: request.id, action },
      { onSuccess: dismissIncoming },
    );
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
      {respondMutation.error && (
        <p role="alert">{respondMutation.error.message}</p>
      )}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={respondMutation.isPending}
          onClick={() => respond("accept")}
        >
          수락
        </button>
        <button
          type="button"
          disabled={respondMutation.isPending}
          onClick={() => respond("reject")}
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
