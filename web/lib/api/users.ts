import { useMutation } from "@tanstack/react-query";
import { apiRequest, changePassword, type User } from "../auth";

// The profile page saves one of the two at a time.
export type ProfileChange =
  | { nickname: string }
  | { currentPassword: string; newPassword: string };

export const useUpdateMe = () =>
  useMutation({
    mutationFn: (body: ProfileChange) => {
      if ("newPassword" in body) return changePassword(body);
      return apiRequest<User>("/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
  });
