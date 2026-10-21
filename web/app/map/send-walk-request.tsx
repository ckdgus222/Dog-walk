"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch, responseError } from "../../lib/auth";
import { useNotifications } from "../_components/notifications-provider";
import styles from "../_components/shared.module.css";

export const SendWalkRequest = ({ receiverId }: { receiverId: number }) => {
  const { refreshRequests } = useNotifications();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [reversePending, setReversePending] = useState(false);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setSent(false);
    setReversePending(false);
    try {
      const response = await apiFetch("/api/walk-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiverId, message }),
      });
      if (!response.ok) {
        const body = await response
          .clone()
          .json()
          .catch(() => null);
        setReversePending(body?.code === "REVERSE_PENDING");
        throw await responseError(response);
      }
      setSent(true);
      setMessage("");
      refreshRequests();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "요청을 보내지 못했어요.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={send}>
      <label>
        메시지 (선택)
        <input
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={100}
        />
      </label>
      <button type="submit" disabled={pending}>
        산책 요청 보내기
      </button>
      {sent && <p role="status">산책 요청을 보냈어요.</p>}
      {error && (
        <p role="alert">
          {error}{" "}
          {reversePending && <Link href="/walk-requests">받은 요청 보기</Link>}
        </p>
      )}
    </form>
  );
};
