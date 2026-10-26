import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "./auth-store";

const user = { id: 1, email: "a@example.com", nickname: "보호자", isDemo: false };

describe("auth store updateUser", () => {
  beforeEach(() => {
    useAuthStore.getState().clearAuth();
  });

  it("changes the logged-in user and keeps the token", () => {
    useAuthStore.getState().setAuth(user, "token");
    useAuthStore.getState().updateUser({ ...user, nickname: "새닉네임" });
    expect(useAuthStore.getState()).toMatchObject({
      user: { ...user, nickname: "새닉네임" },
      accessToken: "token",
    });
  });

  it("stays logged out when the save answers after logout", () => {
    useAuthStore.getState().updateUser({ ...user, nickname: "새닉네임" });
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("ignores a save for another account", () => {
    useAuthStore.getState().setAuth(user, "token");
    useAuthStore
      .getState()
      .updateUser({ id: 2, email: "b@example.com", nickname: "남", isDemo: false });
    expect(useAuthStore.getState().user).toEqual(user);
  });
});
