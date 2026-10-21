"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "./auth-provider";

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  // Replace the cache before rendering any data for a different account.
  return (
    <UserQueryClient key={user?.id ?? "guest"}>{children}</UserQueryClient>
  );
};

const UserQueryClient = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            networkMode: "always",
          },
          mutations: { networkMode: "always" },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};
