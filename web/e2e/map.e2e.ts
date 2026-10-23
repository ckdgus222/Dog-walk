import { randomUUID } from "node:crypto";
import { expect, test as base, type Page, type Route } from "@playwright/test";

const consentMessage =
  "지도 화면을 보고 있는 동안 내 위치를 약 200m 단위로 흐려서 1분마다 저장하고, 주변 사용자에게 보여 줘요. 화면을 닫거나 다른 탭으로 가면 5분 뒤 보이지 않아요. 마지막 위치는 공개를 끄거나 로그아웃할 때까지 보관돼요. 공개는 언제든 끌 수 있고, 로그아웃하면 함께 꺼져요.";
type Account = {
  email: string;
  password: string;
  nickname: string;
  headers: { Authorization: string };
};
const test = base.extend<{ accounts: Account[] }>({
  accounts: async ({ request }, runTest) => {
    const accounts: Account[] = [];
    try {
      for (const name of ["A", "B"]) {
        const runId = randomUUID().slice(0, 12);
        const account = {
          email: `map-${runId}@example.com`,
          password: randomUUID().slice(0, 20),
          nickname: `지도${name}${runId}`,
        };
        expect(
          (
            await request.post("/api/auth/signup", {
              data: {
                ...account,
                dog: {
                  name: name === "B" ? "주변두부" : "보리",
                  breed: "푸들",
                  size: "SMALL",
                  gender: "FEMALE",
                  neutered: true,
                  birthYear: 2021,
                  personality: "친구와 산책을 좋아해요.",
                },
              },
            })
          ).status(),
        ).toBe(201);
        const login = await request.post("/api/auth/login", {
          data: { email: account.email, password: account.password },
        });
        expect(login.status()).toBe(200);
        const headers = {
          Authorization: `Bearer ${(await login.json()).accessToken}`,
        };
        accounts.push({ ...account, headers });
        if (name === "B") {
          expect(
            (
              await request.post("/api/users/me/location-consent", { headers })
            ).status(),
          ).toBe(204);
          expect(
            (
              await request.patch("/api/users/me/location", {
                headers,
                data: { lat: 37.57, lng: 126.978 },
              })
            ).status(),
          ).toBe(200);
        }
      }
      await runTest(accounts);
    } finally {
      for (const account of accounts) {
        expect(
          (
            await request.delete("/api/users/me/location-consent", {
              headers: account.headers,
            })
          ).status(),
        ).toBe(204);
      }
    }
  },
});

test.use({
  geolocation: { latitude: 37.56651, longitude: 126.97801 },
  permissions: ["geolocation"],
});

test.beforeEach(async ({ page }) => {
  await page.clock.install();
});

// The map page has no "홈으로" link (the mockup has none); the logo goes home.
const goHome = async (page: Page) => {
  await page
    .getByRole("banner")
    .getByRole("link", { name: "강아지 산책", exact: true })
    .click();
  await expect(page).toHaveURL("/");
};

const login = async (page: Page, account: Account) => {
  await page.goto("/login");
  const main = page.getByRole("main");
  await main.getByLabel("이메일").fill(account.email);
  await main.getByLabel("비밀번호").fill(account.password);
  await main.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL("/");
  await main.getByRole("link", { name: "주변 친구 찾기", exact: true }).click();
};
const openMap = async (page: Page, accounts: Account[]) => {
  await login(page, accounts[0]);
  const main = page.getByRole("main");
  await expect(main.getByText(consentMessage)).toBeVisible();
  await main.getByRole("button", { name: "동의하고 위치 공개" }).click();
  await main
    .getByRole("region", { name: "주변 산책 친구", exact: true })
    .getByRole("button")
    .filter({ hasText: accounts[1].nickname })
    .click();
  await expect(
    main.getByRole("region", { name: `${accounts[1].nickname}의 반려견` }),
  ).toBeVisible();
};
const setVisibility = async (page: Page, state: "hidden" | "visible") => {
  await page.evaluate((state) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: state,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
};
const holdResponse = async (
  page: Page,
  path: string,
  method: string,
  status?: number,
) => {
  let capture!: () => void;
  const captured = new Promise<void>((resolve) => {
    capture = resolve;
  });
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let held = false;
  const handler = async (route: Route) => {
    if (held || route.request().method() !== method) {
      await route.continue();
      return;
    }
    held = true;
    const response = status ? null : await route.fetch();
    capture();
    await released;
    try {
      if (response) await route.fulfill({ response });
      else
        await route.fulfill({
          status,
          json: { message: "위치 수집에 동의해 주세요." },
        });
    } catch {
      // The app may already have aborted this request.
    } finally {
      finish();
    }
  };
  await page.route(path, handler);
  return {
    captured,
    release: async () => {
      release();
      await finished;
      await page.unroute(path, handler);
    },
  };
};
const locationSaves = (page: Page) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().endsWith("/api/users/me/location") &&
      request.method() === "PATCH"
    ) {
      requests.push(request.url());
    }
  });
  return requests;
};

// Both the initial consent and later sends use the same automatic flow.
test("동의 후 자동 공개·반려견 조회·1분 보내기·30초 주변 갱신·철회", async ({
  page,
  request,
  accounts,
}) => {
  const saves = locationSaves(page);
  await openMap(page, accounts);
  const main = page.getByRole("main");
  const detail = main.getByRole("region", {
    name: `${accounts[1].nickname}의 반려견`,
  });
  await expect(
    detail.getByRole("heading", { name: "주변두부", exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByText("푸들 | 소형 | 암컷 | 중성화 | 2021년생", {
      exact: true,
    }),
  ).toBeVisible();
  expect(saves).toHaveLength(1);
  // Check the 30-second poll before the first 1-minute send: the nearby
  // refetch after a send restarts the poll timer when it finishes.
  expect(
    (
      await request.delete("/api/users/me/location-consent", {
        headers: accounts[1].headers,
      })
    ).status(),
  ).toBe(204);
  await page.clock.fastForward(30_000);
  await expect(
    main.getByRole("button").filter({ hasText: accounts[1].nickname }),
  ).toHaveCount(0);
  await expect(detail).toHaveCount(0);
  await page.clock.fastForward(60_000);
  await expect.poll(() => saves.length).toBe(2);
  page.once("dialog", (dialog) => dialog.accept());
  await main.getByRole("button", { name: "위치 공개 끄기" }).click();
  await expect(main.getByText(consentMessage)).toBeVisible();
  await expect(
    main.getByRole("region", { name: "주변 산책 친구", exact: true }),
  ).toHaveCount(0);
});

test("숨긴 동안 보내지 않고 다시 보이면 즉시 보낸다", async ({
  page,
  accounts,
}) => {
  const saves = locationSaves(page);
  await openMap(page, accounts);
  await setVisibility(page, "hidden");
  await page.clock.fastForward(60_000);
  expect(saves).toHaveLength(1);
  await setVisibility(page, "visible");
  await expect.poll(() => saves.length).toBe(2);
});

for (const leave of ["hidden", "navigate"] as const) {
  test(`${leave}: 같은 칸으로 돌아와도 이전 목록과 상세를 먼저 보여 주지 않는다`, async ({
    page,
    accounts,
  }) => {
    await openMap(page, accounts);
    const main = page.getByRole("main");
    if (leave === "hidden") await setVisibility(page, "hidden");
    else await goHome(page);
    const held = await holdResponse(page, "**/api/users/nearby", "GET");
    if (leave === "hidden") await setVisibility(page, "visible");
    else await main.getByRole("link", { name: "주변 친구 찾기", exact: true }).click();
    await held.captured;
    await expect(
      main.getByRole("region", { name: "주변 산책 친구", exact: true }),
    ).toHaveCount(0);
    await expect(
      main.getByRole("region", { name: `${accounts[1].nickname}의 반려견` }),
    ).toHaveCount(0);
    await held.release();
    await expect(
      main.getByRole("button").filter({ hasText: accounts[1].nickname }),
    ).toBeVisible();
    await expect(
      main.getByRole("region", { name: `${accounts[1].nickname}의 반려견` }),
    ).toHaveCount(0);
  });
}

test("다시 보일 때 위치를 못 얻으면 이전 목록을 숨기고 다음 성공 때 오류를 지운다", async ({
  page,
  context,
  accounts,
}) => {
  await openMap(page, accounts);
  await setVisibility(page, "hidden");
  await context.clearPermissions();
  await setVisibility(page, "visible");
  const main = page.getByRole("main");
  await expect(main.getByRole("alert")).toHaveText(
    "위치를 가져오지 못했어요. 브라우저 위치 권한을 확인해 주세요.",
  );
  await expect(main.getByRole("status")).toHaveText(
    "내 위치를 받아 오고 있어요.",
  );
  await expect(main.getByRole("region")).toHaveCount(0);
  await context.grantPermissions(["geolocation"]);
  await page.clock.fastForward(60_000);
  await expect(
    main.getByRole("button").filter({ hasText: accounts[1].nickname }),
  ).toBeVisible();
  await expect(main.getByRole("alert")).toHaveCount(0);
});

for (const status of [200, 403]) {
  test(`공개 끄기 뒤 늦은 ${status} 저장 응답을 무시한다`, async ({
    page,
    accounts,
  }) => {
    const saves = locationSaves(page);
    await openMap(page, accounts);
    const held = await holdResponse(
      page,
      "**/api/users/me/location",
      "PATCH",
      status === 403 ? status : undefined,
    );
    await page.clock.fastForward(60_000);
    await held.captured;
    await page.clock.fastForward(60_000);
    expect(saves).toHaveLength(2);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("button", { name: "위치 공개 끄기" }),
    ).toBeEnabled();
    page.once("dialog", (dialog) => dialog.accept());
    await main.getByRole("button", { name: "위치 공개 끄기" }).click();
    await expect(main.getByText(consentMessage)).toBeVisible();
    await held.release();
    await expect(main.getByText(consentMessage)).toBeVisible();
    await expect(main.getByRole("alert")).toHaveCount(0);
  });
}

test("토큰 갱신을 기다리다 지도를 떠나면 저장을 재전송하지 않는다", async ({
  page,
  accounts,
}) => {
  await login(page, accounts[0]);
  const saves = locationSaves(page);
  await page.route("**/api/users/me/location", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 401, json: { message: "Unauthorized" } })
      : route.continue(),
  );
  const held = await holdResponse(page, "**/api/auth/refresh", "POST");
  await page.getByRole("button", { name: "동의하고 위치 공개" }).click();
  await held.captured;
  await goHome(page);
  await held.release();
  await page.clock.fastForward(60_000);
  expect(saves).toHaveLength(1);
});

for (const leave of ["hidden", "navigate"] as const) {
  test(`${leave}: 늦게 받은 브라우저 좌표를 보내지 않는다`, async ({
    page,
    accounts,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "releasePosition", {
        configurable: true,
        value: () => {},
        writable: true,
      });
      navigator.geolocation.getCurrentPosition = (success) => {
        Object.assign(window, {
          releasePosition: () =>
            success({
              coords: { latitude: 37.56651, longitude: 126.97801 },
              timestamp: Date.now(),
            } as GeolocationPosition),
        });
        document.documentElement.dataset.positionWaiting = "true";
      };
    });
    await login(page, accounts[0]);
    const saves = locationSaves(page);
    await page.getByRole("button", { name: "동의하고 위치 공개" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-position-waiting",
      "true",
    );
    if (leave === "hidden") await setVisibility(page, "hidden");
    else {
      await goHome(page);
    }
    await page.evaluate(() =>
      (window as unknown as { releasePosition(): void }).releasePosition(),
    );
    await page.clock.fastForward(60_000);
    expect(saves).toHaveLength(0);
  });
}

test("로그아웃 후 다시 지도에 들어오면 동의를 다시 받는다", async ({
  page,
  accounts,
}) => {
  await openMap(page, accounts);
  await goHome(page);
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(
    page.getByRole("main").getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  await login(page, accounts[0]);
  await expect(page.getByText(consentMessage)).toBeVisible();
});

test("다른 탭의 동의 철회를 확인하면 동의 안내로 바뀌고 보내기를 멈춘다", async ({
  page,
  request,
  accounts,
}) => {
  const saves = locationSaves(page);
  await openMap(page, accounts);
  expect(
    (
      await request.delete("/api/users/me/location-consent", {
        headers: accounts[0].headers,
      })
    ).status(),
  ).toBe(204);
  const denied = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/users/me/location") &&
      response.status() === 403,
  );
  await page.clock.fastForward(60_000);
  await denied;
  await expect(page.getByText(consentMessage)).toBeVisible();
  expect(saves).toHaveLength(2);
  await page.clock.fastForward(60_000);
  expect(saves).toHaveLength(2);
});

test("주변 조회 실패 때 이전 목록과 상세를 숨긴다", async ({
  page,
  accounts,
}) => {
  await openMap(page, accounts);
  await page.route("**/api/users/nearby", (route) =>
    route.fulfill({ status: 409, json: { message: "주변 조회 실패" } }),
  );
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "주변 조회 실패",
  );
  await expect(page.getByRole("main").getByRole("region")).toHaveCount(0);
});
