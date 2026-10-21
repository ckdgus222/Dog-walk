import { randomUUID } from "node:crypto";
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";

test("산책 요청 실시간 알림·재접속 동기화·로그아웃 정리", async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const password = randomUUID().slice(0, 20);
  const accounts = [
    {
      email: `walk-a-${runId}@example.com`,
      nickname: `산책A${runId}`,
      lat: 37.566,
    },
    {
      email: `walk-b-${runId}@example.com`,
      nickname: `산책B${runId}`,
      lat: 37.57,
    },
  ];
  const authorizations: string[] = [];
  const userIds: number[] = [];
  const dog = {
    name: "보리",
    breed: "푸들",
    size: "SMALL",
    gender: "FEMALE",
    neutered: true,
    birthYear: 2021,
    personality: "같이 산책해요.",
  };
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  const badge = a.getByLabel("받은 산책 요청 1개", { exact: true });
  const modal = a.getByRole("dialog");
  let upgradedA = false;
  let connectionsB = 0;
  // setOffline() blocks new requests but leaves open WebSockets alone, so the
  // test routes B's socket to be able to drop it on purpose.
  const socketsB = new Set<WebSocketRoute>();
  await b.routeWebSocket(
    (url) => url.pathname === "/socket.io/",
    (ws) => {
      ws.connectToServer();
      connectionsB += 1;
      socketsB.add(ws);
    },
  );

  // Engine.IO sends packet 5 only after the WebSocket probe succeeds.
  a.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/socket.io/") return;
    socket.on("framesent", ({ payload }) => {
      if (payload === "5") upgradedA = true;
    });
  });

  const login = async (page: Page, account: (typeof accounts)[number]) => {
    await page.goto("/login");
    const main = page.getByRole("main");
    await main.getByLabel("이메일").fill(account.email);
    await main.getByLabel("비밀번호").fill(password);
    await main.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(
      main.getByText(`${account.nickname}님, 안녕하세요`),
    ).toBeVisible();
  };

  try {
    await test.step("두 계정을 가입시키고 약 500m 거리의 위치를 저장한다", async () => {
      for (const account of accounts) {
        const signup = await request.post("/api/auth/signup", {
          data: {
            email: account.email,
            nickname: account.nickname,
            password,
            dog,
          },
        });
        expect(signup.status()).toBe(201);
        userIds.push((await signup.json()).id);
        const loginResponse = await request.post("/api/auth/login", {
          data: { email: account.email, password },
        });
        expect(loginResponse.status()).toBe(200);
        const authorization = `Bearer ${(await loginResponse.json()).accessToken}`;
        authorizations.push(authorization);
        const headers = { Authorization: authorization };
        expect(
          (
            await request.post("/api/users/me/location-consent", { headers })
          ).status(),
        ).toBe(204);
        expect(
          (
            await request.patch("/api/users/me/location", {
              headers,
              data: { lat: account.lat, lng: 126.978 },
            })
          ).status(),
        ).toBe(200);
      }
      await login(a, accounts[0]);
      await login(b, accounts[1]);
      await a
        .getByRole("navigation", { name: "주 메뉴" })
        .getByRole("link", { name: "산책 요청", exact: true })
        .click();
      await b
        .getByRole("navigation", { name: "주 메뉴" })
        .getByRole("link", { name: "지도", exact: true })
        .click();
      await expect(a).toHaveURL("/walk-requests");
      await expect(b).toHaveURL("/map");
      // B's socket is routed, so a routed connection proves B upgraded to WebSocket.
      await expect.poll(() => upgradedA && connectionsB > 0).toBe(true);
    });

    await test.step("B가 지도에서 요청하면 A의 배지·모달·받은 목록에 즉시 나타난다", async () => {
      const mainB = b.getByRole("main");
      await mainB
        .getByRole("region", { name: "주변 산책 친구", exact: true })
        .getByRole("button")
        .filter({ hasText: accounts[0].nickname })
        .click();
      const details = mainB.getByRole("region", {
        name: `${accounts[0].nickname}의 반려견`,
        exact: true,
      });
      await details.getByLabel("메시지 (선택)").fill("함께 천천히 걸어요.");
      await details
        .getByRole("button", { name: "산책 요청 보내기", exact: true })
        .click();
      await expect(details.getByText("산책 요청을 보냈어요.")).toBeVisible();
      await expect(b).toHaveURL("/map");
      // A native modal makes the background inert, but it must still be updated.
      await expect(
        a.getByLabel("받은 산책 요청 1개", { exact: true }),
      ).toHaveText("1");
      await expect(modal).toBeVisible();
      await expect(
        modal.getByRole("heading", {
          name: `${accounts[1].nickname}님의 산책 요청`,
        }),
      ).toBeVisible();
      await expect(
        modal.getByText("함께 천천히 걸어요.", { exact: true }),
      ).toBeVisible();
      await expect(
        modal.getByText("보리 · 푸들 · 소형", { exact: true }),
      ).toBeVisible();
      const received = a
        .getByRole("main", { includeHidden: true })
        .getByRole("region", {
          name: "받은 요청",
          exact: true,
          includeHidden: true,
        });
      await expect(
        received.getByText("대기 중", { exact: true }),
      ).toBeVisible();
    });

    await test.step("A가 수락하면 양쪽 화면이 새로고침 없이 바뀐다", async () => {
      await modal.getByRole("button", { name: "수락", exact: true }).click();
      await expect(modal).toHaveCount(0);
      await expect(badge).toHaveCount(0);
      const received = a
        .getByRole("main")
        .getByRole("region", { name: "받은 요청", exact: true });
      await expect(received.getByText("수락됨", { exact: true })).toBeVisible();
      await expect(
        received.getByRole("button", { name: "수락", exact: true }),
      ).toHaveCount(0);
      await expect(
        received.getByRole("button", { name: "거절", exact: true }),
      ).toHaveCount(0);
      const notice = b.getByRole("banner").getByRole("status");
      await expect(
        notice.getByText("보낸 산책 요청이 수락됐어요.", { exact: true }),
      ).toBeVisible();
      await expect(
        notice.getByRole("link", { name: "산책 요청 보기", exact: true }),
      ).toHaveAttribute("href", "/walk-requests");
      await expect(b).toHaveURL("/map");
    });

    await test.step("연결이 끊긴 동안 거절된 요청은 재접속하면 보낸 목록에 반영된다", async () => {
      const response = await request.post("/api/walk-requests", {
        headers: { Authorization: authorizations[1] },
        data: { receiverId: userIds[0], message: "재접속 확인" },
      });
      expect(response.status()).toBe(201);
      const id = (await response.json()).id;
      await expect(modal).toBeVisible();
      await modal.getByRole("button", { name: "닫기", exact: true }).click();
      await b
        .getByRole("navigation", { name: "주 메뉴" })
        .getByRole("link", { name: "산책 요청", exact: true })
        .click();
      const sent = b
        .getByRole("main")
        .getByRole("region", { name: "보낸 요청", exact: true })
        .getByRole("article")
        .filter({ hasText: "재접속 확인" });
      await expect(sent.getByText("대기 중", { exact: true })).toBeVisible();
      const previousConnections = connectionsB;
      await contextB.setOffline(true);
      for (const socket of socketsB) await socket.close();
      socketsB.clear();
      expect(
        (
          await request.patch(`/api/walk-requests/${id}/reject`, {
            headers: { Authorization: authorizations[0] },
          })
        ).status(),
      ).toBe(200);
      await expect(sent.getByText("대기 중", { exact: true })).toBeVisible();
      await contextB.setOffline(false);
      await expect
        .poll(() => connectionsB)
        .toBeGreaterThan(previousConnections);
      await expect(sent.getByText("거절됨", { exact: true })).toBeVisible();
      await expect(
        sent.getByRole("button", { name: "취소", exact: true }),
      ).toHaveCount(0);
    });

    await test.step("모달이 열린 상태의 로그아웃은 알림을 모두 비우고, 재로그인하면 대기 수를 읽는다", async () => {
      await a
        .getByRole("navigation", { name: "주 메뉴" })
        .getByRole("link", { name: "홈", exact: true })
        .click();
      const headersB = { Authorization: authorizations[1] };
      // Leave a notice as well as a pending modal to check that both are removed.
      const canceled = await request.post("/api/walk-requests", {
        headers: headersB,
        data: { receiverId: userIds[0] },
      });
      expect(canceled.status()).toBe(201);
      await expect(modal).toBeVisible();
      expect(
        (
          await request.patch(
            `/api/walk-requests/${(await canceled.json()).id}/cancel`,
            { headers: headersB },
          )
        ).status(),
      ).toBe(200);
      await expect(modal).toHaveCount(0);
      await expect(
        a
          .getByRole("banner")
          .getByText("받은 산책 요청이 취소됐어요.", { exact: true }),
      ).toBeVisible();
      const pending = await request.post("/api/walk-requests", {
        headers: headersB,
        data: { receiverId: userIds[0], message: "로그아웃 확인" },
      });
      expect(pending.status()).toBe(201);
      await expect(modal).toBeVisible();
      await expect(badge).toHaveText("1");
      // A user cannot click behind the modal, but the session can still end while
      // it is open (for example, refresh fails after a login elsewhere). Invoke
      // the logout button's handler to end the session with the modal still up.
      await a
        .getByRole("main", { includeHidden: true })
        .getByRole("button", {
          name: "로그아웃",
          exact: true,
          includeHidden: true,
        })
        .dispatchEvent("click");
      await expect(modal).toHaveCount(0);
      await expect(badge).toHaveCount(0);
      await expect(a.getByRole("banner")).toHaveCount(0);
      await expect(
        a.getByRole("main").getByRole("link", { name: "로그인", exact: true }),
      ).toBeVisible();
      expect(
        (
          await request.patch(
            `/api/walk-requests/${(await pending.json()).id}/cancel`,
            { headers: headersB },
          )
        ).status(),
      ).toBe(200);
      const offline = await request.post("/api/walk-requests", {
        headers: headersB,
        data: { receiverId: userIds[0], message: "다시 로그인한 뒤 거절" },
      });
      expect(offline.status()).toBe(201);
      await login(a, accounts[0]);
      await expect(badge).toHaveText("1");
      await expect(modal).toHaveCount(0);
      await a
        .getByRole("navigation", { name: "주 메뉴" })
        .getByRole("link", { name: /산책 요청/ })
        .click();
      const received = a
        .getByRole("main")
        .getByRole("region", { name: "받은 요청", exact: true })
        .getByRole("article")
        .filter({ hasText: "다시 로그인한 뒤 거절" });
      await received.getByRole("button", { name: "거절", exact: true }).click();
      await expect(received.getByText("거절됨", { exact: true })).toBeVisible();
      await expect(badge).toHaveCount(0);
    });
  } finally {
    await contextB.setOffline(false);
    const cleanup = await Promise.allSettled(
      authorizations.map(async (authorization) => {
        const response = await request.delete(
          "/api/users/me/location-consent",
          { headers: { Authorization: authorization } },
        );
        expect(response.status()).toBe(204);
      }),
    );
    await Promise.all([contextA.close(), contextB.close()]);
    for (const result of cleanup)
      if (result.status === "rejected") throw result.reason;
  }
});
