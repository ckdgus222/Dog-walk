"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";
import { useNotifications } from "./notifications-provider";
import styles from "./notifications.module.css";

export const SiteHeader = () => {
  const { user } = useAuth();
  const { pendingCount, pendingCountError, notice, dismissNotice } =
    useNotifications();
  if (!user) return null;
  return (
    <header className={styles.header}>
      <nav aria-label="주 메뉴">
        <Link href="/">홈</Link>
        <Link href="/map">지도</Link>
        <Link href="/dogs">내 반려견</Link>
        <Link href="/diaries">일기</Link>
        <Link href="/walk-requests">
          산책 요청{" "}
          {pendingCount > 0 && (
            <span
              className={styles.badge}
              aria-label={`받은 산책 요청 ${pendingCount}개`}
            >
              {pendingCount}
            </span>
          )}
        </Link>
      </nav>
      {pendingCountError && <p role="alert">{pendingCountError}</p>}
      {notice && (
        <div role="status" className={styles.notice}>
          <p>{notice.text}</p>
          <Link href={notice.href}>
            {notice.href === "/walk-requests" ? "산책 요청 보기" : "채팅 보기"}
          </Link>
          <button type="button" onClick={dismissNotice}>
            닫기
          </button>
        </div>
      )}
    </header>
  );
};
