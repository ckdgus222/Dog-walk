"use client";

import Link from "next/link";
import {
  useRespondToWalkRequest,
  useWalkRequests,
} from "../../lib/api/walk-requests";
import type { WalkRequest } from "../../lib/types";
import { AuthGate } from "../_components/auth-gate";
import { DogFace, genderLabels, sizeLabels } from "../_components/dog-card";
import headingStyles from "../_components/heading.module.css";
import layoutStyles from "../_components/layout.module.css";
import { useNotifications } from "../_components/notifications-provider";
import styles from "./walk-requests.module.css";

// A received request waiting for an answer shows its buttons instead.
const statusLabels = {
  PENDING: "요청 중",
  ACCEPTED: "수락됨",
  REJECTED: "거절됨",
  CANCELED: "취소됨",
};

const WalkRequestsPage = () => {
  return (
    <main className={layoutStyles.main}>
      <div className={styles.head}>
        <h1 className={headingStyles.title}>산책 요청</h1>
        <p className={headingStyles.lead}>
          주변의 반려인과 산책을 요청하고, 받은 요청을 확인할 수 있어요.
        </p>
      </div>
      <AuthGate>
        <RequestLists />
      </AuthGate>
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
          className={styles.box}
        >
          <h2>
            {box === "received" ? "받은 요청" : "보낸 요청"}{" "}
            {requests[box] && <span>{requests[box].length}</span>}
          </h2>
          {requests[box]?.length === 0 && (
            <p className={styles.empty}>아직 요청이 없어요.</p>
          )}
          {requests[box] && requests[box].length > 0 && (
            <div className={styles.list}>
              {requests[box].map((request) => (
                <article key={request.id} className={styles.request}>
                  <RequestInfo
                    request={request}
                    withPersonality={box === "received"}
                  />
                  <div
                    className={`${styles.side} ${box === "received" && request.status === "PENDING" ? styles.answer : ""}`}
                  >
                    {(box === "sent" || request.status !== "PENDING") && (
                      <p
                        className={`${styles.status} ${styles[request.status]}`}
                      >
                        {statusLabels[request.status]}
                      </p>
                    )}
                    {request.status === "ACCEPTED" && (
                      <Link
                        href={`/chat/${request.id}`}
                        className={styles.primary}
                      >
                        채팅하기
                      </Link>
                    )}
                    {request.status === "PENDING" &&
                      (box === "received" ? (
                        <>
                          <button
                            type="button"
                            className={styles.primary}
                            disabled={respondMutation.isPending}
                            onClick={() => respond(request.id, "accept")}
                          >
                            수락
                          </button>
                          <button
                            type="button"
                            className={styles.secondary}
                            disabled={respondMutation.isPending}
                            onClick={() => respond(request.id, "reject")}
                          >
                            거절
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={styles.secondary}
                          disabled={respondMutation.isPending}
                          onClick={() => respond(request.id, "cancel")}
                        >
                          취소
                        </button>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
};

// The counterpart's first dog leads the row, as in the mockup.
const RequestInfo = ({
  request,
  withPersonality,
}: {
  request: WalkRequest;
  withPersonality: boolean;
}) => {
  const [dog, ...otherDogs] = request.counterpart.dogs;
  return (
    <>
      {dog && <DogFace dog={dog} className={styles.face} size={110} />}
      <div className={styles.info}>
        <h3>{request.counterpart.nickname}</h3>
        {dog && (
          <p className={styles.dogLine}>
            {dog.name}
            {/* Phones drop the breed and gender, as in the phone mockup. */}
            <span className={styles.wideOnly}>
              {` · ${dog.breed}`}
            </span>
            {` · ${sizeLabels[dog.size]}`}
            <span className={styles.wideOnly}>
              {` · ${genderLabels[dog.gender]}`}
            </span>
            {` · ${dog.birthYear}년생`}
            {otherDogs.length > 0 &&
              `, ${otherDogs.map((other) => other.name).join(", ")}`}
          </p>
        )}
        {request.message && (
          <p className={styles.message}>{request.message}</p>
        )}
        {withPersonality && dog && (
          <p className={styles.personality}>{dog.personality}</p>
        )}
        <time dateTime={request.createdAt}>
          {new Date(request.createdAt).toLocaleString("ko-KR", {
            dateStyle: "long",
            timeStyle: "short",
          })}
        </time>
      </div>
    </>
  );
};
