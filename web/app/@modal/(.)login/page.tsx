"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../_components/auth-provider";
import { AuthModal } from "../../_components/auth-modal";
import { LoginForm } from "../../_components/login-form";

const LoginModalPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (loading || user) return null;

  return (
    <AuthModal title="로그인" pending={pending}>
      <LoginForm
        variant="modal"
        onPendingChange={setPending}
        onSuccess={() => router.back()}
      />
    </AuthModal>
  );
};
export default LoginModalPage;
