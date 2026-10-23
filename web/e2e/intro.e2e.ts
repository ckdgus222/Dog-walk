import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Route,
} from "@playwright/test";

test.use({
  storageState: { cookies: [], origins: [] },
  reducedMotion: "no-preference",
});

const createAccount = async (request: APIRequestContext) => {
  const id = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const account = {
    email: `intro-${id}@example.com`,
    nickname: `인트로${id}`,
    password: randomUUID().slice(0, 20),
  };
  const response = await request.post("/api/auth/signup", {
    data: {
      ...account,
      dog: {
        name: "인트로두부",
        breed: "푸들",
        size: "SMALL",
        gender: "FEMALE",
        neutered: true,
        birthYear: 2022,
        personality: "함께 걸어요.",
      },
    },
  });
  expect(response.status()).toBe(201);
  return account;
};

test("첫 방문은 모달로 홈을 막고 건너뛰기에 초점을 두며 6초에 제거된다", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-23T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-23T00:00:00Z"));
  await page.goto("/");
  const intro = page.getByRole("dialog", { name: "인트로" });
  const skip = intro.getByRole("button", { name: "건너뛰기" });
  await expect(intro).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
  await expect(skip).toBeFocused();
  expect(await intro.evaluate((node) => node.matches(":modal"))).toBe(true);
  expect(
    await page.evaluate(() => localStorage.getItem("dog-walk:intro-seen")),
  ).toBe("1");
  expect(
    await page
      .locator("body")
      .evaluate((node) => getComputedStyle(node).overflowY),
  ).toBe("hidden");
  await expect(intro.locator('[aria-hidden="true"] img')).toHaveCount(10);
  await expect(
    skip.locator('xpath=ancestor::*[@aria-hidden="true"]'),
  ).toHaveCount(0);

  // Even a programmatic focus attempt cannot reach the home behind the modal.
  await page
    .locator("main a")
    .first()
    .evaluate((node: HTMLElement) => node.focus());
  await expect(skip).toBeFocused();
  // Tab past the only button leaves the page for the browser's own controls,
  // so check that it never lands on the home behind the modal.
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      document.querySelector("main")?.contains(document.activeElement),
    ),
  ).toBe(false);
  await page.clock.runFor(5999);
  await expect(intro).toHaveCount(1);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
  await page.clock.runFor(1);
  await expect(intro).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  // The Tab above moved focus out of the page, so read the page's own record.
  expect(
    await page.evaluate(() => document.activeElement === document.body),
  ).toBe(true);
});

for (const method of ["건너뛰기", "Esc"]) {
  test(`${method}로 즉시 끝내고 새로고침해도 다시 보이지 않는다`, async ({
    page,
  }) => {
    await page.goto("/");
    const intro = page.getByRole("dialog", { name: "인트로" });
    await expect(intro).toBeVisible();
    const started = Date.now();
    if (method === "건너뛰기")
      await intro.getByRole("button", { name: method }).click();
    if (method === "Esc") await page.keyboard.press("Escape");
    await expect(intro).toHaveCount(0);
    expect(Date.now() - started).toBeLessThan(3000);
    await expect(page.locator("body")).toBeFocused();
    await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
    await page.reload();
    await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
    await page
      .getByRole("banner")
      .getByRole("link", { name: "로그인", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "로그인", exact: true }),
    ).toBeVisible();
  });
}

test("인트로 재생을 시작하자마자 새로고침해도 다시 보이지 않는다", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
});

test("본 뒤 다른 화면에서 로고로 홈에 돌아와도 다시 보이지 않는다", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.goto("/dogs");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "강아지 산책", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
});

test("가입 화면으로 처음 와서 로고로 홈에 오면 없고 홈을 새로 열면 보인다", async ({
  page,
}) => {
  await page.goto("/signup");
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  expect(
    await page.evaluate(() => localStorage.getItem("dog-walk:intro-seen")),
  ).toBeNull();
  await page
    .getByRole("banner")
    .getByRole("link", { name: "강아지 산책", exact: true })
    .click();
  await expect(page).toHaveURL("/");
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("dog-walk:intro-seen")),
  ).toBeNull();
  await page.reload();
  await expect(page.getByRole("dialog", { name: "인트로" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
});

for (const operation of ["getItem", "setItem"] as const) {
  test(`저장소 ${operation} 실패 시 인트로를 없애고 홈을 쓸 수 있다`, async ({
    page,
  }) => {
    await page.addInitScript((method) => {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function (key: string, value?: string) {
        if (key === "dog-walk:intro-seen")
          throw new DOMException(
            "Storage unavailable",
            method === "setItem" ? "QuotaExceededError" : "SecurityError",
          );
        return Reflect.apply(original, this, [key, value]);
      };
    }, operation);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
    await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
    await page
      .getByRole("banner")
      .getByRole("link", { name: "로그인", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "로그인", exact: true }),
    ).toBeVisible();
  });
}

test("움직임 줄이기에서는 본 기록 없이 홈을 사용할 수 있다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("dog-walk:intro-seen")),
  ).toBeNull();
  await page
    .getByRole("banner")
    .getByRole("link", { name: "로그인", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "로그인", exact: true }),
  ).toBeVisible();
});

for (const entry of [
  "첫 방문",
  "재방문",
  "빈 본 기록",
  "다른 주소",
  "움직임 줄이기",
  "읽기 실패",
]) {
  test(`수화 전에도 ${entry} 조건에 맞게 보이고 open 속성이 없다`, async ({
    page,
  }) => {
    // Block hydration bundles while allowing the synchronous head script and CSS.
    await page.route("**/*.js*", (route) => route.abort());
    if (entry === "재방문" || entry === "빈 본 기록") {
      await page.addInitScript(
        (value) => localStorage.setItem("dog-walk:intro-seen", value),
        entry === "빈 본 기록" ? "" : "1",
      );
    }
    if (entry === "움직임 줄이기")
      await page.emulateMedia({ reducedMotion: "reduce" });
    if (entry === "읽기 실패") {
      await page.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          get() {
            throw new DOMException("Storage unavailable", "SecurityError");
          },
        });
      });
    }
    await page.goto(entry === "다른 주소" ? "/signup" : "/");
    const intro = page.locator('dialog[aria-label="인트로"]');
    await expect(intro).toHaveCount(1);
    await expect(intro).not.toHaveAttribute("open");
    if (entry === "첫 방문") {
      await expect(intro).toBeVisible();
      await expect(page.locator("html")).not.toHaveAttribute("data-intro");
      return;
    }
    await expect(intro).toBeHidden();
    await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
  });
}

test("첫 방문과 재방문 모두 수화 경고나 실행 오류가 없다", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (
      /hydrat|didn't match|did not match|server rendered/i.test(message.text())
    )
      errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "건너뛰기" }).click();
  await page.reload();
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
  await page
    .getByRole("banner")
    .getByRole("link", { name: "로그인", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "로그인", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("그림 응답이 오지 않아도 6초 뒤 제거된다", async ({ page }) => {
  const heldImages: Route[] = [];
  await page.route("**/_next/image?*", (route) => {
    const source = new URL(route.request().url()).searchParams.get("url");
    // Static imports serve the intro drawings from /_next/static/media/.
    const introImage =
      /\/_next\/static\/media\/(cloud-\d|hills|field|grass-front|(dubu|bami)-run-\d)\./;
    if (source && introImage.test(source)) {
      heldImages.push(route);
      return;
    }
    return route.continue();
  });
  await page.clock.install({ time: new Date("2026-10-23T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-23T00:00:00Z"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
  await expect.poll(() => heldImages.length).toBeGreaterThan(0);
  await page.clock.runFor(6000);
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
});

test("로그인 쿠키 복원이 재생 중 끝나도 같은 인트로가 원래 시각에 끝난다", async ({
  page,
  context,
}) => {
  const account = await createAccount(context.request);
  const loggedIn = await context.request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(loggedIn.status()).toBe(200);
  let capture!: (route: Route) => void;
  const captured = new Promise<Route>((resolve) => {
    capture = resolve;
  });
  await page.route("**/api/auth/refresh", (route) => capture(route), {
    times: 1,
  });
  await page.clock.install({ time: new Date("2026-10-23T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-23T00:00:00Z"));
  await page.goto("/");
  const intro = page.locator('dialog[aria-label="인트로"]');
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
  const originalDialog = await intro.elementHandle();
  await page.clock.runFor(3000);
  const route = await captured;
  const response = await route.fetch();
  expect(response.status()).toBe(200);
  await route.fulfill({ response });
  await expect(page.locator("header")).toContainText(account.nickname);
  expect(
    await intro.evaluate((node, original) => node === original, originalDialog),
  ).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
  await expect(page.getByRole("button", { name: "건너뛰기" })).toBeFocused();
  await page.clock.runFor(2999);
  await expect(intro).toHaveCount(1);
  await page.clock.runFor(1);
  await expect(intro).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
});

test("본 뒤 로그인과 로그아웃으로 상태가 바뀌어도 다시 보이지 않는다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  await page.goto("/");
  await page.getByRole("button", { name: "건너뛰기" }).click();
  const header = page.getByRole("banner");
  await header.getByRole("link", { name: "로그인", exact: true }).click();
  const login = page.getByRole("dialog", { name: "로그인", exact: true });
  await login.getByLabel("이메일").fill(account.email);
  await login.getByLabel("비밀번호").fill(account.password);
  await login.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(header).toContainText(account.nickname);
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
  await header.getByRole("button", { name: "로그아웃" }).click();
  await expect(
    header.getByRole("link", { name: "로그인", exact: true }),
  ).toBeVisible();
  await expect(page.locator('dialog[aria-label="인트로"]')).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-intro", "done");
});
