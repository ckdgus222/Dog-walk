"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch, responseError } from "../../lib/auth";
import { useAuth } from "../auth-provider";
import { useNotifications, type WalkRequest } from "../notifications-provider";
import styles from "../dogs/dogs.module.css";

const statusLabels = {
  PENDING: "대기 중",
  ACCEPTED: "수락됨",
  REJECTED: "거절됨",
  CANCELED: "취소됨",
};

export default function WalkRequestsPage() {
  const { user, loading } = useAuth();
  return (
    <main className={styles.main}>
      <h1>산책 요청</h1>
      {loading ? (
        <p role="status">로그인 상태를 확인하고 있어요.</p>
      ) : !user ? (
        <Link href="/login">로그인</Link>
      ) : (
        <RequestLists key={user.id} />
      )}
      <Link href="/">홈으로</Link>
    </main>
  );
}

function RequestLists() {
  const { requestsVersion, refreshRequests, incoming, dismissIncoming } =
    useNotifications();
  const [requests, setRequests] = useState<{
    received: WalkRequest[];
    sent: WalkRequest[];
  } | null>(null);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadRequests() {
      try {
        const responses = await Promise.all(
          ["received", "sent"].map((box) =>
            apiFetch(`/api/walk-requests?box=${box}`, {
              signal: controller.signal,
            }),
          ),
        );
        for (const response of responses) {
          if (!response.ok) throw await responseError(response);
        }
        const [received, sent]: WalkRequest[][] = await Promise.all(
          responses.map((response) => response.json()),
        );
        if (!controller.signal.aborted) {
          setRequests({ received, sent });
          setError("");
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "요청을 불러오지 못했어요.",
          );
      }
    }
    void loadRequests();
    return () => controller.abort();
  }, [requestsVersion]);

  async function respond(id: number, action: "accept" | "reject" | "cancel") {
    if (action === "cancel" && !window.confirm("산책 요청을 취소할까요?"))
      return;
    setPendingId(id);
    setError("");
    try {
      const response = await apiFetch(`/api/walk-requests/${id}/${action}`, {
        method: "PATCH",
      });
      if (!response.ok) throw await responseError(response);
      if (incoming?.id === id) dismissIncoming();
      refreshRequests();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "요청을 처리하지 못했어요.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {!requests && !error && <p role="status">요청을 불러오고 있어요.</p>}
      {(["received", "sent"] as const).map((box) => (
        <section
          key={box}
          aria-label={box === "received" ? "받은 요청" : "보낸 요청"}
          className={styles.cards}
        >
          <h2>{box === "received" ? "받은 요청" : "보낸 요청"}</h2>
          {requests?.[box].length === 0 && <p>아직 요청이 없어요.</p>}
          {requests?.[box].map((request) => (
            <article key={request.id} className={styles.card}>
              <h3>{request.counterpart.nickname}</h3>
              <p>
                {request.counterpart.dogs.map((dog) => dog.name).join(", ")}
              </p>
              {request.message && <p>{request.message}</p>}
              <p>{statusLabels[request.status]}</p>
              <time dateTime={request.createdAt}>
                {new Date(request.createdAt).toLocaleString("ko-KR")}
              </time>
              {request.status === "PENDING" && (
                <div className={styles.actions}>
                  {box === "received" ? (
                    <>
                      <button
                        type="button"
                        disabled={pendingId !== null}
                        onClick={() => void respond(request.id, "accept")}
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        disabled={pendingId !== null}
                        onClick={() => void respond(request.id, "reject")}
                      >
                        거절
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={pendingId !== null}
                      onClick={() => void respond(request.id, "cancel")}
                    >
                      취소
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      ))}
    </>
  );
}
