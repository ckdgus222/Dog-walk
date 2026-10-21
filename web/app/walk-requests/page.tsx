"use client";

import Link from "next/link";
import {
  useRespondToWalkRequest,
  useWalkRequests,
} from "../../lib/api/walk-requests";
import { AuthGate } from "../_components/auth-gate";
import { useNotifications } from "../_components/notifications-provider";
import styles from "../_components/shared.module.css";

const statusLabels = {
  PENDING: "대기 중",
  ACCEPTED: "수락됨",
  REJECTED: "거절됨",
  CANCELED: "취소됨",
};

const WalkRequestsPage = () => {
  return (
    <main className={styles.main}>
      <h1>산책 요청</h1>
      <AuthGate>
        <RequestLists />
      </AuthGate>
      <Link href="/">홈으로</Link>
    </main>
  );
};
export default WalkRequestsPage;

const RequestLists = () => {
  const { incoming, dismissIncoming } = useNotifications();
  const received = useWalkRequests("received");
  const sent = useWalkRequests("sent");
  const respondMutation = useRespondToWalkRequest();
  const requests = { received: received.data, sent: sent.data };
  const error =
    respondMutation.error?.message ??
    received.error?.message ??
    sent.error?.message;

  const respond = (id: number, action: "accept" | "reject" | "cancel") => {
    if (action === "cancel" && !window.confirm("산책 요청을 취소할까요?"))
      return;
    respondMutation.mutate(
      { id, action },
      {
        onSuccess: () => {
          if (incoming?.id === id) dismissIncoming();
        },
      },
    );
  };

  return (
    <>
      {error && <p role="alert">{error}</p>}
      {(received.isPending || sent.isPending) && !error && (
        <p role="status">요청을 불러오고 있어요.</p>
      )}
      {(["received", "sent"] as const).map((box) => (
        <section
          key={box}
          aria-label={box === "received" ? "받은 요청" : "보낸 요청"}
          className={styles.cards}
        >
          <h2>{box === "received" ? "받은 요청" : "보낸 요청"}</h2>
          {requests[box]?.length === 0 && <p>아직 요청이 없어요.</p>}
          {requests[box]?.map((request) => (
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
                        disabled={respondMutation.isPending}
                        onClick={() => respond(request.id, "accept")}
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        disabled={respondMutation.isPending}
                        onClick={() => respond(request.id, "reject")}
                      >
                        거절
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={respondMutation.isPending}
                      onClick={() => respond(request.id, "cancel")}
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
};
