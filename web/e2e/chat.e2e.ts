import { randomUUID } from "node:crypto";
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import type { ChatHistory } from "../lib/types";

test("1:1 채팅·전송 대기·조회 경쟁·알림·재접속·인증 갱신", async ({
  browser,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const password = randomUUID().slice(0, 20);
  const accounts = [
    {
      email: `chat-a-${runId}@example.com`,
      nickname: `채팅A${runId}`,
      lat: 37.566,
    },
    {
      email: `chat-b-${runId}@example.com`,
      nickname: `채팅B${runId}`,
      lat: 37.57,
    },
  ];
  const authorizations: string[] = [];
  const userIds: number[] = [];
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  let walkRequestId: number;
  let upgradesA = 0;
  let upgradesB = 0;
  let holdSend = false;
  const heldSends: { server: WebSocketRoute; frame: string | Buffer }[] = [];
  const socketsB = new Map<WebSocketRoute, WebSocketRoute>();
  const releaseResponses: (() => void)[] = [];

  await a.routeWebSocket(
    (url) => url.pathname === "/socket.io/",
    (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((frame) => {
        if (frame === "5") upgradesA += 1;
        if (holdSend && /^42\d*\["chat:send",/.test(frame.toString())) {
          heldSends.push({ server, frame });
        } else {
          server.send(frame);
        }
      });
    },
  );
  await b.routeWebSocket(
    (url) => url.pathname === "/socket.io/",
    (ws) => {
      const server = ws.connectToServer();
      socketsB.set(ws, server);
      ws.onMessage((frame) => {
        if (frame === "5") upgradesB += 1;
        server.send(frame);
      });
      ws.onClose(() => {
        socketsB.delete(ws);
        void server.close();
      });
      server.onClose(() => {
        socketsB.delete(ws);
        void ws.close();
      });
    },
  );

  const login = async (page: Page, account: (typeof accounts)[number]) => {
    await page.goto("/login");
    const main = page.getByRole("main");
    await main.getByLabel("이메일").fill(account.email);
    await main.getByLabel("비밀번호").fill(password);
    await main.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(
      main.getByText(`${account.nickname}님, 안녕하세요`),
    ).toBeVisible();
  };
  const openRequests = async (page: Page) => {
    await page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "산책 요청", exact: true })
      .click();
    await expect(page).toHaveURL("/walk-requests");
  };
  const openChat = async (page: Page, counterpart: string) => {
    await page
      .getByRole("main")
      .getByRole("article")
      .filter({ hasText: counterpart })
      .getByRole("link", { name: "채팅하기", exact: true })
      .click();
    await expect(page).toHaveURL(`/chat/${walkRequestId}`);
  };
  const sendMessage = async (page: Page, content: string) => {
    const main = page.getByRole("main");
    await main.getByLabel("메시지", { exact: true }).fill(content);
    await main.getByRole("button", { name: "보내기", exact: true }).click();
    await expect(main.getByLabel("메시지", { exact: true })).toHaveValue("");
    await expect(
      main
        .getByRole("list", { name: "채팅 메시지" })
        .getByText(content, { exact: true }),
    ).toHaveCount(1);
  };
  const expectMessage = async (page: Page, content: string) => {
    const message = page
      .getByRole("main")
      .getByRole("list", { name: "채팅 메시지" })
      .getByText(content, { exact: true });
    await expect(message).toHaveCount(1);
    await expect(message).toBeVisible();
  };

  try {
    await test.step("API로 두 계정과 위치를 준비하고 B의 요청을 A가 수락한다", async () => {
      for (const account of accounts) {
        const signup = await request.post("/api/auth/signup", {
          data: {
            email: account.email,
            nickname: account.nickname,
            password,
            dog: {
              name: "보리",
              breed: "푸들",
              size: "SMALL",
              gender: "FEMALE",
              neutered: true,
              birthYear: 2021,
              personality: "같이 산책해요.",
            },
          },
        });
        expect(signup.status()).toBe(201);
        userIds.push((await signup.json()).id);
        const loggedIn = await request.post("/api/auth/login", {
          data: { email: account.email, password },
        });
        expect(loggedIn.status()).toBe(200);
        const authorization = `Bearer ${(await loggedIn.json()).accessToken}`;
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
      const sent = await request.post("/api/walk-requests", {
        headers: { Authorization: authorizations[1] },
        data: { receiverId: userIds[0] },
      });
      expect(sent.status()).toBe(201);
      walkRequestId = (await sent.json()).id;
      expect(
        (
          await request.patch(`/api/walk-requests/${walkRequestId}/accept`, {
            headers: { Authorization: authorizations[0] },
          })
        ).status(),
      ).toBe(200);
      await login(a, accounts[0]);
      await login(b, accounts[1]);
      await expect.poll(() => upgradesA > 0 && upgradesB > 0).toBe(true);
    });

    await test.step("받은·보낸 요청의 링크로 들어가 양방향 전송하고 새로고침한다", async () => {
      await openRequests(a);
      await openRequests(b);
      await openChat(a, accounts[1].nickname);
      await openChat(b, accounts[0].nickname);
      await expect(
        a.getByRole("main").getByRole("heading", {
          name: `${accounts[1].nickname}님과의 채팅`,
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        b.getByRole("main").getByRole("heading", {
          name: `${accounts[0].nickname}님과의 채팅`,
          exact: true,
        }),
      ).toBeVisible();
      const first = `첫 인사 ${runId}`;
      const reply = `인사 답장 ${runId}`;
      await sendMessage(a, first);
      await expectMessage(b, first);
      await sendMessage(b, reply);
      await expectMessage(a, reply);
      await expect(a.getByRole("banner").getByRole("status")).toHaveCount(0);
      await expect(b.getByRole("banner").getByRole("status")).toHaveCount(0);
      const previousUpgrades = upgradesA;
      await a.reload();
      await expectMessage(a, first);
      await expectMessage(a, reply);
      await expect.poll(() => upgradesA).toBeGreaterThan(previousUpgrades);
    });

    await test.step("전송 대기 중 버튼과 Enter를 반복해도 한 번만 저장한다", async () => {
      const content = `전송 대기 ${runId}`;
      const input = a.getByRole("main").getByLabel("메시지", { exact: true });
      const button = a
        .getByRole("main")
        .getByRole("button", { name: "보내기", exact: true });
      holdSend = true;
      await input.fill(content);
      await button.click();
      await expect.poll(() => heldSends.length).toBe(1);
      await expect(input).toBeDisabled();
      await expect(button).toBeDisabled();
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await button.dispatchEvent("click");
        await input.dispatchEvent("keydown", {
          key: "Enter",
          code: "Enter",
          bubbles: true,
        });
        await a.keyboard.press("Enter");
      }
      expect(heldSends).toHaveLength(1);
      holdSend = false;
      for (const { server, frame } of heldSends.splice(0)) server.send(frame);
      await expect(input).toBeEnabled();
      await expect(input).toHaveValue("");
      await expectMessage(a, content);
      await expectMessage(b, content);
      const response = await request.get(
        `/api/walk-requests/${walkRequestId}/messages`,
        {
          headers: { Authorization: authorizations[0] },
        },
      );
      expect(response.status()).toBe(200);
      const history: ChatHistory = await response.json();
      expect(
        history.messages.filter((message) => message.content === content),
      ).toHaveLength(1);
    });

    await test.step("첫 기록 조회 중 도착한 메시지가 늦은 응답에 지워지지 않는다", async () => {
      // A full navigation clears B's query cache before its first history read.
      const previousUpgrades = upgradesB;
      await b.goto("/walk-requests");
      await expect.poll(() => upgradesB).toBeGreaterThan(previousUpgrades);
      let held = false;
      let captured = false;
      let released = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      releaseResponses.push(release);
      await b.route(
        `**/api/walk-requests/${walkRequestId}/messages`,
        async (route) => {
          if (held) {
            await route.continue();
            return;
          }
          held = true;
          const response = await route.fetch();
          captured = true;
          await gate;
          // Socket delivery cancels this stale request before starting a new one.
          await route.fulfill({ response }).catch(() => {});
          released = true;
        },
      );
      await openChat(b, accounts[0].nickname);
      await expect.poll(() => captured).toBe(true);
      const content = `첫 조회 도중 ${runId}`;
      await sendMessage(a, content);
      await expectMessage(b, content);
      release();
      await expect.poll(() => released).toBe(true);
      await expectMessage(b, content);
      await b.unroute(`**/api/walk-requests/${walkRequestId}/messages`);
    });

    await test.step("채팅방 밖에서는 새 메시지 안내를 누르면 해당 채팅으로 이동한다", async () => {
      await a
        .getByRole("banner")
        .getByRole("link", { name: "강아지 산책", exact: true })
        .click();
      await expect(a).toHaveURL("/");
      const content = `밖에서 받은 메시지 ${runId}`;
      await sendMessage(b, content);
      const notice = a.getByRole("banner").getByRole("status");
      await expect(
        notice.getByText(`${accounts[1].nickname}님의 새 메시지`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        notice.getByRole("link", { name: "채팅 보기", exact: true }),
      ).toHaveAttribute("href", `/chat/${walkRequestId}`);
      await notice
        .getByRole("link", { name: "채팅 보기", exact: true })
        .click();
      await expect(a).toHaveURL(`/chat/${walkRequestId}`);
      await expectMessage(a, content);
      await notice.getByRole("button", { name: "닫기", exact: true }).click();
    });

    await test.step("오프라인에는 전송을 막고 재접속하면 빠진 메시지 두 개를 채운다", async () => {
      await contextB.setOffline(true);
      for (const [ws, server] of [...socketsB]) {
        await ws.close();
        await server.close();
      }
      socketsB.clear();
      const main = b.getByRole("main");
      await main
        .getByLabel("메시지", { exact: true })
        .fill(`오프라인 초안 ${runId}`);
      await expect(
        main.getByRole("button", { name: "보내기", exact: true }),
      ).toBeDisabled();
      await expect(
        main.getByText("연결하고 있어요.", { exact: true }),
      ).toBeVisible();
      const first = `연결 끊긴 동안 하나 ${runId}`;
      const second = `연결 끊긴 동안 둘 ${runId}`;
      await sendMessage(a, first);
      await sendMessage(a, second);
      await expect(main.getByText(first, { exact: true })).toHaveCount(0);
      await expect(main.getByText(second, { exact: true })).toHaveCount(0);
      await contextB.setOffline(false);
      await expectMessage(b, first);
      await expectMessage(b, second);
      await expect(
        main.getByRole("button", { name: "보내기", exact: true }),
      ).toBeEnabled();
      await expect(main.getByLabel("메시지", { exact: true })).toHaveValue(
        `오프라인 초안 ${runId}`,
      );
      await main.getByLabel("메시지", { exact: true }).fill("");
    });

    await test.step("소켓 갱신과 목록 API 두 개의 401이 겹쳐도 갱신은 한 번만 한다", async () => {
      // After the offline step Socket.IO may stay on HTTP polling for a while.
      // Reload so B opens a fresh WebSocket, which the test needs to inject the
      // server-side disconnect packet. Wait for the upgrade frame ("5"):
      // packets sent while the WebSocket is still a probe are ignored.
      const previousUpgrades = upgradesB;
      await b.reload();
      await expect
        .poll(() => upgradesB, { timeout: 15_000 })
        .toBeGreaterThan(previousUpgrades);
      await expect(
        b
          .getByRole("main")
          .getByRole("button", { name: "보내기", exact: true }),
      ).toBeAttached();
      let refreshRequests = 0;
      let refreshHeld = false;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      releaseResponses.push(release);
      const unauthorized = new Set<string>();
      const retries = new Set<string>();
      let refreshedAuthorization: string | undefined;
      await b.route("**/api/auth/refresh", async (route) => {
        refreshRequests += 1;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        refreshedAuthorization = `Bearer ${(await response.json()).accessToken}`;
        refreshHeld = true;
        await gate;
        await route.fulfill({ response });
      });
      await b.route("**/api/walk-requests?box=*", async (route) => {
        const box = new URL(route.request().url()).searchParams.get("box")!;
        if (!unauthorized.has(box)) {
          await route.fulfill({
            status: 401,
            json: { message: "Unauthorized" },
          });
          unauthorized.add(box);
          return;
        }
        expect(
          route.request().headers()["authorization"] === refreshedAuthorization,
        ).toBe(true);
        retries.add(box);
        await route.continue();
      });
      await expect.poll(() => socketsB.size).toBe(1);
      const [ws, server] = [...socketsB][0];
      // Disconnect the server namespace too, so reconnecting does not reuse
      // a namespace that the server still considers connected.
      server.send("41");
      ws.send("41");
      await expect.poll(() => refreshHeld).toBe(true);
      await openRequests(b);
      await expect
        .poll(() => [...unauthorized].sort())
        .toEqual(["received", "sent"]);
      expect(refreshRequests).toBe(1);
      release();
      await expect
        .poll(() => [...retries].sort())
        .toEqual(["received", "sent"]);
      const main = b.getByRole("main");
      await expect(
        main
          .getByRole("region", { name: "받은 요청", exact: true })
          .getByText("아직 요청이 없어요.", { exact: true }),
      ).toBeVisible();
      await expect(
        main
          .getByRole("region", { name: "보낸 요청", exact: true })
          .getByRole("heading", { name: accounts[0].nickname, exact: true }),
      ).toBeVisible();
      await expect(b.getByRole("banner")).toBeVisible();
      await openChat(b, accounts[0].nickname);
      const first = `갱신 뒤 A ${runId}`;
      const reply = `갱신 뒤 B ${runId}`;
      await sendMessage(a, first);
      await expectMessage(b, first);
      await sendMessage(b, reply);
      await expectMessage(a, reply);
      expect(refreshRequests).toBe(1);
      await b.unroute("**/api/auth/refresh");
      await b.unroute("**/api/walk-requests?box=*");
    });
  } finally {
    for (const release of releaseResponses) release();
    await contextB.setOffline(false);
    const cleanup = await Promise.allSettled(
      authorizations.map(async (authorization) => {
        const response = await request.delete(
          "/api/users/me/location-consent",
          {
            headers: { Authorization: authorization },
          },
        );
        expect(response.status()).toBe(204);
      }),
    );
    await Promise.all([contextA.close(), contextB.close()]);
    for (const result of cleanup)
      if (result.status === "rejected") throw result.reason;
  }
});
