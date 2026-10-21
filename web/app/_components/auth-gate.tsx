"use client";

import Link from "next/link";
import { Fragment } from "react";
import { useAuth } from "./auth-provider";

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return <p role="status">로그인 상태를 확인하고 있어요.</p>;
  if (!user) return <Link href="/login">로그인</Link>;
  // The key drops all state inside when the account changes.
  return <Fragment key={user.id}>{children}</Fragment>;
};
