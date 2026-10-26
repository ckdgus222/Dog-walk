"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useRespondToWalkRequest,
  useWalkRequests,
} from "../../lib/api/walk-requests";
import type { WalkRequest } from "../../lib/types";
import crouchPetHeader from "../../public/illustrations/walking-drawing/crouch-pet-header.png";
import { AuthGate } from "../_components/auth-gate";
import { dangerButton, primaryButton } from "../_components/buttons";
import { DogFace, genderLabels, sizeLabels } from "../_components/dog-card";
import { EmptyState } from "../_components/empty-state";
import headingStyles from "../_components/heading.module.css";
import layoutStyles from "../_components/layout.module.css";
import { useNotifications } from "../_components/notifications-provider";
import { PersonFace } from "../_components/person-face";
import uiStyles from "../_components/ui.module.css";
import styles from "./walk-requests.module.css";

const statusLabels = {
  PENDING: "요청 중",
  ACCEPTED: "수락됨",
  REJECTED: "거절됨",
  CANCELED: "취소됨",
};

const statusBadges = {
  PENDING: uiStyles.pending,
  ACCEPTED: uiStyles.accepted,
  REJECTED: uiStyles.closed,
  CANCELED: uiStyles.closed,
};

const requestTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "long",
  timeStyle: "short",
});

// Only the sender has something to do while a box is empty.
const emptyHints = {
  received: { description: "이웃이 요청을 보내면 여기에 보여요." },
  sent: {
    description: "주변 친구에게 먼저 요청해 보세요.",
    action: { href: "/map", label: "주변 친구 찾기" },
  },
};

const WalkRequestsPage = () => {
  return (
    <main
      className={`${layoutStyles.main} ${layoutStyles.fit} ${styles.page}`}
    >
      <div className={styles.head}>
        <div>
          <h1 className={headingStyles.title}>산책 요청</h1>
          <p className={headingStyles.lead}>
            주변의 반려인과 산책을 요청하고, 받은 요청을 확인할 수 있어요.
          </p>
        </div>
        <Image
          src={crouchPetHeader}
          alt=""
          sizes="(max-width: 720px) 280px, 440px"
          loading="eager"
        />
      </div>
      <AuthGate>
        <div className={styles.boxes}>
          <RequestLists />
        </div>
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
            <EmptyState title="아직 요청이 없어요." {...emptyHints[box]} />
          )}
          {requests[box] && requests[box].length > 0 && (
            <div className={styles.list}>
              {requests[box].map((request) => (
                <RequestCard
                  key={request.id}
                  request={request}
                  box={box}
                  busy={respondMutation.isPending}
                  respond={respond}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </>
  );
};

const RequestCard = ({
  request,
  box,
  busy,
  respond,
}: {
  request: WalkRequest;
  box: "received" | "sent";
  busy: boolean;
  respond: (id: number, action: "accept" | "reject" | "cancel") => void;
}) => {
  const pending = request.status === "PENDING";
  const answering = pending && box === "received";
  return (
    <article className={`${uiStyles.card} ${styles.request}`}>
      <RequestInfo request={request} withPersonality={box === "received"} />
      <div className={styles.end}>
        <p className={styles.when}>
          {/* A received request waiting for an answer shows its buttons
              instead of a status. */}
          {!answering && (
            <span
              className={`${uiStyles.badge} ${statusBadges[request.status]}`}
            >
              {statusLabels[request.status]}
            </span>
          )}
          <time dateTime={request.createdAt}>
            {requestTime.format(new Date(request.createdAt))}
          </time>
        </p>
        <div className={styles.buttons}>
          {request.status === "ACCEPTED" && (
            <Link href={`/chat/${request.id}`} className={primaryButton}>
              채팅하기
            </Link>
          )}
          {answering && (
            <>
              <button
                type="button"
                className={primaryButton}
                disabled={busy}
                onClick={() => respond(request.id, "accept")}
              >
                수락
              </button>
              <button
                type="button"
                className={dangerButton}
                disabled={busy}
                onClick={() => respond(request.id, "reject")}
              >
                거절
              </button>
            </>
          )}
          {pending && !answering && (
            <button
              type="button"
              className={dangerButton}
              disabled={busy}
              onClick={() => respond(request.id, "cancel")}
            >
              취소
            </button>
          )}
        </div>
      </div>
    </article>
  );
};

// The counterpart's face and first dog lead the card, as in the mockup.
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
      <span className={styles.faces}>
        <PersonFace userId={request.counterpart.id} size={64} />
        {dog && <DogFace dog={dog} className={uiStyles.face} size={64} />}
      </span>
      <div className={styles.info}>
        <h3 className={uiStyles.cardTitle}>{request.counterpart.nickname}</h3>
        {dog && (
          <p className={uiStyles.meta}>
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
          <p className={uiStyles.meta}>{dog.personality}</p>
        )}
      </div>
    </>
  );
};
