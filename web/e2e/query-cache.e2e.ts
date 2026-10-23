import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type Route,
} from "@playwright/test";
import type { Dog } from "../lib/types";

const dog = {
  name: "보리",
  breed: "푸들",
  size: "SMALL",
  gender: "FEMALE",
  neutered: true,
  birthYear: 2021,
  personality: "같이 산책해요.",
};

const createAccount = async (request: APIRequestContext, dogName = "보리") => {
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const account = {
    email: `cache-${runId}@example.com`,
    nickname: `캐시${runId}`,
    password: randomUUID().slice(0, 20),
  };
  const signup = await request.post("/api/auth/signup", {
    data: { ...account, dog: { ...dog, name: dogName } },
  });
  expect(signup.status()).toBe(201);
  const { id } = await signup.json();
  const login = await request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(200);
  const headers = {
    Authorization: `Bearer ${(await login.json()).accessToken}`,
  };
  const response = await request.get("/api/dogs/me", { headers });
  expect(response.status()).toBe(200);
  const dogs: Dog[] = await response.json();
  return { ...account, id: id as number, headers, dog: dogs[0] };
};

// Navigate to /login before calling this; account switching must retain memory.
const login = async (
  page: Page,
  account: { email: string; password: string; nickname: string },
) => {
  const main = page.getByRole("main");
  await main.getByLabel("이메일").fill(account.email);
  await main.getByLabel("비밀번호").fill(account.password);
  await main.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(
    main.getByText(`${account.nickname}님, 안녕하세요`),
  ).toBeVisible();
};

// Fetch the old response now, but deliver it only after the competing change.
const holdNextResponse = async (page: Page, path: string, method = "GET") => {
  let capture!: (value: { route: Route; response: APIResponse }) => void;
  const captured = new Promise<{ route: Route; response: APIResponse }>(
    (resolve) => {
      capture = resolve;
    },
  );
  let held = false;
  const handler = async (route: Route) => {
    if (held || route.request().method() !== method) {
      await route.continue();
      return;
    }
    held = true;
    const response = await route.fetch();
    capture({ route, response });
  };
  await page.route(path, handler);
  return {
    captured,
    release: async () => {
      const { route, response } = await captured;
      // Cancellation by the app can make fulfilling an old response fail.
      await route.fulfill({ response }).catch(() => {});
      await page.unroute(path, handler);
    },
  };
};

const publishLocation = async (
  request: APIRequestContext,
  headers: { Authorization: string },
  lat = 37.566,
) => {
  expect(
    (
      await request.post("/api/users/me/location-consent", { headers })
    ).status(),
  ).toBe(204);
  expect(
    (
      await request.patch("/api/users/me/location", {
        headers,
        data: { lat, lng: 126.978 },
      })
    ).status(),
  ).toBe(200);
};

const revokeLocation = async (
  request: APIRequestContext,
  headers: { Authorization: string },
) => {
  expect(
    (
      await request.delete("/api/users/me/location-consent", { headers })
    ).status(),
  ).toBe(204);
};

test("계정 전환 중 이전 계정의 반려견 캐시를 보여 주지 않는다", async ({
  page,
  request,
}) => {
  const a = await createAccount(request, "계정A반려견");
  const b = await createAccount(request, "계정B반려견");
  const main = page.getByRole("main");
  await page.goto("/login");
  await login(page, a);
  await main.getByRole("link", { name: "내 반려견", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: a.dog.name, exact: true }),
  ).toBeVisible();
  await main.getByRole("link", { name: "홈으로" }).click();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "로그아웃" })
    .click();
  await main.getByRole("link", { name: "로그인", exact: true }).click();
  // The home page loads my dogs right after login, so hold that first request.
  const held = await holdNextResponse(page, "**/api/dogs/me");
  await login(page, b);
  await held.captured;
  await expect(main.getByRole("status")).toHaveText(
    "반려견을 불러오고 있어요.",
  );
  await expect(page.getByText(a.dog.name)).toHaveCount(0);
  await held.release();
  await expect(main.getByText(b.dog.name, { exact: true })).toBeVisible();
  await main.getByRole("link", { name: "내 반려견", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: b.dog.name, exact: true }),
  ).toBeVisible();
});

test("수정 폼은 재진입과 목록 삭제 중에도 최신 값을 읽고 저장 후 이동한다", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createAccount(request);
  const secondResponse = await request.post("/api/dogs", {
    headers: account.headers,
    multipart: { dog: JSON.stringify({ ...dog, name: "두부" }) },
  });
  expect(secondResponse.status()).toBe(201);
  const second: Dog = await secondResponse.json();
  const main = page.getByRole("main");
  const firstCard = main
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: dog.name, exact: true }),
    });
  await page.goto("/login");
  await login(page, account);
  await main.getByRole("link", { name: "내 반려견", exact: true }).click();
  await expect(main.getByRole("article")).toHaveCount(2);

  for (const breed of ["첫 변경 견종", "재진입 견종"]) {
    expect(
      (
        await request.patch(`/api/dogs/${account.dog.id}`, {
          headers: account.headers,
          multipart: { dog: JSON.stringify({ ...dog, breed }) },
        })
      ).status(),
    ).toBe(200);
    const held = await holdNextResponse(page, "**/api/dogs/me");
    await firstCard.getByRole("link", { name: "수정", exact: true }).click();
    await held.captured;
    await expect(main.getByRole("status")).toHaveText(
      "반려견을 불러오고 있어요.",
    );
    await expect(main.getByLabel("견종")).toHaveCount(0);
    await expect(main.locator("form")).toHaveCount(0);
    await held.release();
    await expect(main.getByLabel("견종")).toHaveValue(breed);
    const listResponse = page.waitForResponse("**/api/dogs/me");
    await main.getByRole("link", { name: "내 반려견", exact: true }).click();
    await listResponse;
    await expect(
      firstCard.getByText(`${breed} · 소형 · 암컷`, { exact: true }),
    ).toBeVisible();
  }

  expect(
    (
      await request.patch(`/api/dogs/${account.dog.id}`, {
        headers: account.headers,
        multipart: {
          dog: JSON.stringify({ ...dog, breed: "삭제 중 최신 견종" }),
        },
      })
    ).status(),
  ).toBe(200);
  const deletion = await holdNextResponse(
    page,
    `**/api/dogs/${second.id}`,
    "DELETE",
  );
  page.once("dialog", (dialog) => dialog.accept());
  await main
    .getByRole("article")
    .filter({ hasText: "두부" })
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await deletion.captured;
  const edit = await holdNextResponse(page, "**/api/dogs/me");
  await firstCard.getByRole("link", { name: "수정", exact: true }).click();
  await edit.captured;
  await deletion.release();
  await expect(main.getByRole("status")).toHaveText(
    "반려견을 불러오고 있어요.",
  );
  await expect(main.locator("form")).toHaveCount(0);
  await edit.release();
  await expect(main.getByLabel("견종")).toHaveValue("삭제 중 최신 견종");

  await page.route("**/api/dogs/me", (route) =>
    route.fulfill({
      status: 500,
      json: { message: "목록 갱신 실패" },
    }),
  );
  await main.getByLabel("견종").fill("저장한 견종");
  await main.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page).toHaveURL("/dogs");
  await expect(main.getByRole("alert")).toHaveText("목록 갱신 실패");
  const saved = await request.get("/api/dogs/me", { headers: account.headers });
  expect(saved.status()).toBe(200);
  expect(await saved.json()).toMatchObject([
    { id: account.dog.id, breed: "저장한 견종" },
  ]);
});

test("수정 조회가 실패하면 첫 진입과 재진입 모두 캐시로 폼을 만들지 않는다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  const main = page.getByRole("main");
  let failEdit = false;
  await page.route("**/api/dogs/me", (route) =>
    failEdit
      ? route.fulfill({ status: 500, json: { message: "수정 조회 실패" } })
      : route.continue(),
  );
  await page.goto("/login");
  await login(page, account);
  await main.getByRole("link", { name: "내 반려견", exact: true }).click();
  await expect(main.getByRole("article")).toHaveCount(1);

  for (const fail of [true, false, true]) {
    failEdit = fail;
    await main.getByRole("link", { name: "수정", exact: true }).click();
    if (fail) {
      await expect(main.getByRole("alert")).toHaveText("수정 조회 실패");
      await expect(main.locator("form")).toHaveCount(0);
      await expect(main.getByLabel("견종")).toHaveCount(0);
    } else {
      await expect(main.getByLabel("견종")).toHaveValue(dog.breed);
    }
    failEdit = false;
    const listResponse = page.waitForResponse("**/api/dogs/me");
    await main.getByRole("link", { name: "내 반려견", exact: true }).click();
    await listResponse;
    await expect(main.getByRole("article")).toHaveCount(1);
  }
});

test("위치 동의를 철회한 뒤 늦은 조회가 공개 상태를 되살리지 않는다", async ({
  page,
  context,
  request,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 37.56651, longitude: 126.97801 });
  const account = await createAccount(request);
  const main = page.getByRole("main");
  try {
    await publishLocation(request, account.headers);
    await page.goto("/login");
    await login(page, account);
    await main.getByRole("link", { name: "주변 친구 찾기", exact: true }).click();
    await expect(
      main.getByRole("button", { name: "위치 공개 끄기" }),
    ).toBeVisible();
    await main.getByRole("link", { name: "홈으로" }).click();
    const held = await holdNextResponse(page, "**/api/users/me/location");
    await main.getByRole("link", { name: "주변 친구 찾기", exact: true }).click();
    const { response } = await held.captured;
    expect(await response.json()).toMatchObject({ consented: true });
    page.once("dialog", (dialog) => dialog.accept());
    await main.getByRole("button", { name: "위치 공개 끄기" }).click();
    await expect(
      main.getByRole("button", { name: "동의하고 위치 공개" }),
    ).toBeVisible();
    await held.release();
    await expect(
      main.getByRole("button", { name: "동의하고 위치 공개" }),
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "위치 공개 끄기" }),
    ).toHaveCount(0);
  } finally {
    await revokeLocation(request, account.headers);
  }
});

for (const moved of [true, false]) {
  test(`주기 보내기 뒤 ${moved ? "다른 칸은 목록과 상세를 비운다" : "같은 칸은 목록과 상세를 유지한다"}`, async ({
    page,
    context,
    request,
  }) => {
    await page.clock.install();
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation({ latitude: 37.56651, longitude: 126.97801 });
    const account = await createAccount(request);
    const neighbor = await createAccount(request, "주변두부");
    const main = page.getByRole("main");
    try {
      await publishLocation(request, account.headers);
      await publishLocation(request, neighbor.headers, 37.57);
      await page.goto("/login");
      await login(page, account);
      await main.getByRole("link", { name: "주변 친구 찾기", exact: true }).click();
      const neighbors = main.getByRole("region", {
        name: "주변 산책 친구",
        exact: true,
      });
      await neighbors
        .getByRole("button")
        .filter({ hasText: neighbor.nickname })
        .click();
      const detail = main.getByRole("region", {
        name: `${neighbor.nickname}의 반려견`,
        exact: true,
      });
      await expect(detail).toBeVisible();
      let release!: () => void;
      const released = new Promise<void>((resolve) => {
        release = resolve;
      });
      let capture!: () => void;
      const captured = new Promise<void>((resolve) => {
        capture = resolve;
      });
      // The 30-second poll and the save can both start a nearby query.
      const holdNearby = async (route: Route) => {
        const response = await route.fetch();
        capture();
        await released;
        await route.fulfill({ response }).catch(() => {});
      };
      await page.route("**/api/users/nearby", holdNearby);
      if (moved) {
        await context.setGeolocation({
          latitude: 37.56851,
          longitude: 126.97801,
        });
      }
      const saved = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/users/me/location") &&
          response.request().method() === "PATCH",
      );
      await page.clock.fastForward(60_000);
      await saved;
      await captured;
      if (moved) {
        await expect(neighbors).toHaveCount(0);
        await expect(detail).toHaveCount(0);
        await expect(main.getByRole("status")).toHaveText(
          "주변 사용자를 불러오고 있어요.",
        );
      } else {
        await expect(neighbors).toBeVisible();
        await expect(detail).toBeVisible();
      }
      release();
      await expect(
        neighbors.getByRole("button").filter({ hasText: neighbor.nickname }),
      ).toBeVisible();
      // A poll may still be inside holdNearby; do not let it fail the test
      // when the page closes.
      await page.unrouteAll({ behavior: "ignoreErrors" });
      if (moved) await expect(detail).toHaveCount(0);
      else await expect(detail).toBeVisible();
    } finally {
      await revokeLocation(request, account.headers);
      await revokeLocation(request, neighbor.headers);
    }
  });
}

test("첫 대기 수 조회보다 늦게 온 산책 알림의 배지 수를 유지한다", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const receiver = await createAccount(request);
  const sender = await createAccount(request);
  let upgraded = false;
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/socket.io/") return;
    socket.on("framesent", ({ payload }) => {
      if (payload === "5") upgraded = true;
    });
  });
  try {
    await publishLocation(request, receiver.headers);
    await publishLocation(request, sender.headers, 37.57);
    const held = await holdNextResponse(
      page,
      "**/api/walk-requests/pending-count",
    );
    await page.goto("/login");
    await login(page, receiver);
    const { response } = await held.captured;
    expect(await response.json()).toEqual({ count: 0 });
    await expect.poll(() => upgraded).toBe(true);
    expect(
      (
        await request.post("/api/walk-requests", {
          headers: sender.headers,
          data: { receiverId: receiver.id, message: "함께 걸어요." },
        })
      ).status(),
    ).toBe(201);
    await expect(page.getByRole("dialog")).toBeVisible();
    const badge = page.getByLabel("받은 산책 요청 1개", { exact: true });
    await expect(badge).toHaveText("1");
    await held.release();
    await expect(badge).toHaveText("1");
  } finally {
    await revokeLocation(request, receiver.headers);
    await revokeLocation(request, sender.headers);
  }
});

test("회원가입에서 입력한 반려견 필드를 로그인 후 카드에 표시한다", async ({
  page,
}) => {
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const account = {
    email: `signup-cache-${runId}@example.com`,
    nickname: `가입${runId}`,
    password: randomUUID().slice(0, 20),
  };
  const main = page.getByRole("main");
  await page.goto("/signup");
  await main.getByLabel("이메일").fill(account.email);
  await main.getByLabel("비밀번호 (8~20자)").fill(account.password);
  await main.getByLabel("닉네임").fill(account.nickname);
  await main.getByLabel("이름", { exact: true }).fill("가입두부");
  await main.getByLabel("견종").fill("진돗개");
  await main.getByRole("radio", { name: "중형", exact: true }).check();
  await main.getByRole("radio", { name: "수컷", exact: true }).check();
  await main.getByLabel("중성화했어요").check();
  await main.getByLabel("태어난 해").fill("2022");
  await main.getByLabel("성격 소개").fill("천천히 걷는 걸 좋아해요.");
  await main.getByRole("button", { name: "가입하기", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await login(page, account);
  await main.getByRole("link", { name: "내 반려견", exact: true }).click();
  const card = main.getByRole("article");
  await expect(
    card.getByRole("heading", { name: "가입두부", exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("진돗개 · 중형 · 수컷", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("중성화했어요 · 2022년생", { exact: true }),
  ).toBeVisible();
  await expect(
    card.getByText("천천히 걷는 걸 좋아해요.", { exact: true }),
  ).toBeVisible();
});
