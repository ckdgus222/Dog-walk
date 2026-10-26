"use client";

import Link, { type LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "./auth-provider";
import { AuthModal } from "./auth-modal";
import { LoginForm } from "./login-form";
import { MenuIcon } from "./icons";
import { useNotifications } from "./notifications-provider";
import styles from "./site-header.module.css";

export const SiteHeader = () => {
  const { user, loading, logout } = useAuth();
  const { pendingCount, pendingCountError, notice, dismissNotice } =
    useNotifications();
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  if (loading) return null;
  if (!user) return <GuestHeader />;

  const handleLogout = async () => {
    setLogoutError("");
    setLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : "로그아웃하지 못했습니다.",
      );
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.logo}>
          강아지 산책
        </Link>
        <MainMenu pendingCount={pendingCount} />
        <div className={styles.account}>
          <span className={styles.greeting}>{user.nickname}님, 안녕하세요</span>
          <MenuLink href="/me">내 정보</MenuLink>
          <button type="button" disabled={loggingOut} onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </div>
      <div className={styles.floating}>
        {pendingCountError && (
          <p role="alert" className={styles.message}>
            {pendingCountError}
          </p>
        )}
        {logoutError && (
          <p role="alert" className={styles.message}>
            {logoutError}
          </p>
        )}
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
      </div>
    </header>
  );
};

const MainMenu = ({
  pendingCount,
  onLockedClick,
}: {
  pendingCount: number;
  onLockedClick?: () => void;
}) => {
  const handleNavigate: LinkProps["onNavigate"] = (event) => {
    if (!onLockedClick) return;
    event.preventDefault();
    onLockedClick();
  };

  return (
    <nav aria-label="주 메뉴" className={styles.menu}>
      <MenuLink href="/map" onNavigate={handleNavigate}>
        주변 친구
      </MenuLink>
      <MenuLink href="/walk-requests" onNavigate={handleNavigate}>
        산책 요청{" "}
        {pendingCount > 0 && (
          <span
            className={styles.badge}
            aria-label={`받은 산책 요청 ${pendingCount}개`}
          >
            {pendingCount}
          </span>
        )}
      </MenuLink>
      <MenuLink href="/dogs" onNavigate={handleNavigate}>
        내 반려견
      </MenuLink>
      <MenuLink href="/diaries" onNavigate={handleNavigate}>
        산책 일기
      </MenuLink>
      <MenuLink href="/posts" onNavigate={handleNavigate}>
        게시판
      </MenuLink>
    </nav>
  );
};

const GuestLinks = () => (
  <>
    <MenuLink href="/login">로그인</MenuLink>
    <MenuLink href="/signup">회원가입</MenuLink>
    <MenuLink href="/">홈으로</MenuLink>
  </>
);

// Guests see the same menu; the account links fold into a menu button on
// phones, as in the mockup.
const GuestHeader = () => {
  // Reset the notice and account menu whenever the path changes.
  const pathname = usePathname();
  return <GuestHeaderContent key={pathname} />;
};

const GuestHeaderContent = () => {
  const pathname = usePathname();
  // A locked menu item opens the login window here, without changing the
  // address. Logging in swaps this header for the member one, which closes
  // the window too.
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginPending, setLoginPending] = useState(false);
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link href="/" className={styles.logo}>
          강아지 산책
        </Link>
        <MainMenu pendingCount={0} onLockedClick={() => setLoginOpen(true)} />
        <div className={`${styles.account} ${styles.guestLinks}`}>
          <GuestLinks />
        </div>
        <details className={styles.guestMenu}>
          <summary aria-label="계정 메뉴">
            <MenuIcon />
          </summary>
          <div>
            <GuestLinks />
          </div>
        </details>
      </div>
      {loginOpen && (
        <AuthModal
          title="로그인"
          pending={loginPending}
          onClose={() => setLoginOpen(false)}
        >
          <LoginForm
            variant="menu"
            onPendingChange={setLoginPending}
            onSuccess={() => {}}
            // On /signup the signup form is already on the page: going there
            // again would open the signup window over it, so only close.
            onSignupClick={(event) => {
              if (pathname === "/signup") event.preventDefault();
              setLoginOpen(false);
            }}
          />
        </AuthModal>
      )}
    </header>
  );
};

// Rendered only after the login check, which runs in the browser and never
// while prerendering, so usePathname cannot suspend dynamic routes such as
// /dogs/[id]/edit.
const MenuLink = ({
  href,
  children,
  onNavigate,
}: {
  href: string;
  children: React.ReactNode;
  onNavigate?: LinkProps["onNavigate"];
}) => {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      onNavigate={onNavigate}
    >
      {children}
    </Link>
  );
};
