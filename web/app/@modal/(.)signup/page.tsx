"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "../../_components/auth-provider";
import { AuthModal } from "../../_components/auth-modal";
import { SignupForm } from "../../_components/signup-form";

const SignupModalPage = () => {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (loading || user) return null;

  return (
    <AuthModal title="회원가입" pending={pending} wide>
      <SignupForm
        modal
        onPendingChange={setPending}
        onSuccess={() => router.replace("/login")}
      />
    </AuthModal>
  );
};
export default SignupModalPage;
