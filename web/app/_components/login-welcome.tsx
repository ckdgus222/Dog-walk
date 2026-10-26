"use client";

import { useEffect } from "react";
import { useAuthStore } from "../../lib/auth-store";
import styles from "./login-welcome.module.css";

// "{nickname}님, 환영해요!" for a few seconds after logging in on this page.
// Outside the header, whose status messages are the live notices.
export const LoginWelcome = () => {
  const nickname = useAuthStore((state) => state.welcomeNickname);
  const dismissWelcome = useAuthStore((state) => state.dismissWelcome);

  useEffect(() => {
    if (!nickname) return;
    const timer = setTimeout(dismissWelcome, 3000);
    return () => clearTimeout(timer);
  }, [nickname, dismissWelcome]);

  return (
    <div role="status" className={styles.welcome}>
      {nickname && <p>{nickname}님, 환영해요!</p>}
    </div>
  );
};
