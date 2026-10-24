"use client";

import { useRouter } from "next/navigation";
import layoutStyles from "../_components/layout.module.css";
import { LoginForm } from "../_components/login-form";

const LoginPage = () => {
  const router = useRouter();

  return (
    <main className={layoutStyles.main}>
      <LoginForm onSuccess={() => router.push("/")} />
    </main>
  );
};
export default LoginPage;
