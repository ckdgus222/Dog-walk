import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
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

test("첫 방문은 모달로 홈을 막고 건너뛰기에 초점을 두며 8초에 제거된다", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-23T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-23T00:00:01Z"));
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
  await expect(intro.locator('[aria-hidden="true"] img')).toHaveCount(18);
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
  await page.clock.runFor(7999);
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
    .getByRole("link", { name: "옆집 강아지", exact: true })
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
    .getByRole("link", { name: "옆집 강아지", exact: true })
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
      // The scene must wait for the JS timer, or the two would drift apart.
      const animations = await intro.evaluate((node) =>
        node
          .getAnimations({ subtree: true })
          .map(({ playState, currentTime }) => ({ playState, currentTime })),
      );
      expect(animations.length).toBeGreaterThan(0);
      expect(
        animations.filter(
          ({ playState, currentTime }) =>
            playState !== "paused" || currentTime !== 0,
        ),
      ).toEqual([]);
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

test("그림 응답이 오지 않아도 8초 뒤 제거된다", async ({ page }) => {
  const heldImages: Route[] = [];
  await page.route("**/_next/image?*", (route) => {
    const source = new URL(route.request().url()).searchParams.get("url");
    // Static imports serve the intro drawings from /_next/static/media/.
    const introImage =
      /\/_next\/static\/media\/(cloud-\d|hills|field|grass-front|heart|(dubu|bami)-(run-\d|stand-\d|sniff|turn))\./;
    if (source && introImage.test(source)) {
      heldImages.push(route);
      return;
    }
    return route.continue();
  });
  await page.clock.install({ time: new Date("2026-10-23T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-23T00:00:01Z"));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
  await expect.poll(() => heldImages.length).toBeGreaterThan(0);
  await page.clock.runFor(8000);
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
  await page.clock.pauseAt(new Date("2026-10-23T00:00:01Z"));
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
  await page.clock.runFor(4999);
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

// CSS animations ignore page.clock, so these hold every intro animation at
// one moment of its timeline and measure the scene there.
const holdIntroAt = (page: Page, time: number) =>
  page.evaluate((at) => {
    const intro = document.querySelector('dialog[aria-label="인트로"]');
    for (const animation of intro!.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = at;
    }
  }, time);

const startIntro = async (page: Page) => {
  await page.clock.install({ time: new Date("2026-10-23T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-10-23T00:00:01Z"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-intro", "playing");
};

// A dog of the intro scene: the box that moves and flips, found through its
// run frame.
const introDog = (page: Page, name: "bami" | "dubu") =>
  page
    .locator(`dialog img[src*="${name}-run"]`)
    .first()
    .locator("xpath=ancestor::div[contains(@style, 'aspect-ratio')]");

// Above 0 while the dog faces right, below 0 while its drawing is flipped.
const facing = (dog: Locator) =>
  dog.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).a);

test("3.8초에 두 강아지가 가운데 양쪽에서 마주 본다", async ({ page }) => {
  await startIntro(page);
  await holdIntroAt(page, 3800);
  const width = page.viewportSize()!.width;
  const bami = (await introDog(page, "bami").boundingBox())!;
  const dubu = (await introDog(page, "dubu").boundingBox())!;
  expect(bami.x).toBeGreaterThanOrEqual(0);
  expect(bami.x + bami.width).toBeLessThanOrEqual(width / 2);
  expect(dubu.x).toBeGreaterThanOrEqual(width / 2);
  expect(dubu.x + dubu.width).toBeLessThanOrEqual(width);
  expect(await facing(introDog(page, "bami"))).toBeGreaterThan(0);
  expect(await facing(introDog(page, "dubu"))).toBeLessThan(0);
});

// Where each nose tip sits on its 1448 x 1086 sniff drawing. Dubu's drawing
// is flipped on screen, so its x counts from the right edge.
const SNIFF_NOSES = { bami: { x: 1443, y: 640 }, dubu: { x: 1445, y: 572 } };

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
]) {
  test(`${viewport.width}px 화면에서 코 인사 때 두 코끝이 맞닿을 듯 가깝다`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startIntro(page);
    await holdIntroAt(page, 3700);
    const nose = async (name: "bami" | "dubu") => {
      const box = (await page
        .locator(`dialog img[src*="${name}-sniff"]`)
        .boundingBox())!;
      const fromLeft = (SNIFF_NOSES[name].x / 1448) * box.width;
      return {
        x: name === "dubu" ? box.x + box.width - fromLeft : box.x + fromLeft,
        y: box.y + (SNIFF_NOSES[name].y / 1086) * box.height,
      };
    };
    const bami = await nose("bami");
    const dubu = await nose("dubu");
    expect(dubu.x - bami.x).toBeGreaterThan(0);
    expect(dubu.x - bami.x).toBeLessThan(24);
    expect(Math.abs(dubu.y - bami.y)).toBeLessThan(6);
  });
}

test("만나는 동안 박자마다 강아지별로 한 자세만 보인다", async ({ page }) => {
  await startIntro(page);
  const shownPoses = (name: "bami" | "dubu") =>
    introDog(page, name).evaluate((dog) =>
      [...dog.querySelectorAll("img")]
        .filter((image) => Number(getComputedStyle(image).opacity) > 0.5)
        .map(
          (image) =>
            decodeURIComponent(image.src).match(
              /(run-\d|stand-\d|sniff|turn)\./,
            )![1],
        ),
    );
  // Each moment sits inside a beat, away from the switches.
  const beats = [
    { at: 3250, bami: "stand-1", dubu: "stand-1" },
    { at: 3700, bami: "sniff", dubu: "sniff" },
    { at: 4050, bami: "stand-1", dubu: "stand-1" },
    { at: 4200, bami: "stand-2", dubu: "stand-2" },
    { at: 4400, bami: "stand-1", dubu: "stand-1" },
    { at: 4600, bami: "stand-2", dubu: "stand-2" },
    { at: 4900, bami: "stand-1", dubu: "turn" },
  ];
  for (const { at, bami, dubu } of beats) {
    await holdIntroAt(page, at);
    expect(
      [await shownPoses("bami"), await shownPoses("dubu")],
      `${at}ms`,
    ).toEqual([[bami], [dubu]]);
  }

  await holdIntroAt(page, 5600);
  const running = [expect.stringMatching(/^run-\d$/)];
  expect(await shownPoses("bami")).toEqual(running);
  expect(await shownPoses("dubu")).toEqual(running);
  expect(await facing(introDog(page, "dubu"))).toBeGreaterThan(0);
});

test("카메라가 하늘에서 내려와 1.8초에 앞풀이 제자리에 온다", async ({
  page,
}) => {
  await startIntro(page);
  const grassTop = () =>
    page.evaluate(
      () =>
        document
          .querySelector('dialog img[src*="grass-front"]')!
          .parentElement!.getBoundingClientRect().top,
    );
  await holdIntroAt(page, 0);
  const start = await grassTop();
  await holdIntroAt(page, 1800);
  const landed = await grassTop();
  await holdIntroAt(page, 7000);
  expect(await grassTop()).toBeCloseTo(landed, 0);
  expect(start - landed).toBeGreaterThan(
    (page.viewportSize()?.height ?? 0) * 0.3,
  );
});

test("좁은 화면에서 제목은 단어 사이에서만 줄이 바뀐다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startIntro(page);
  // The top of every letter, word by word.
  const words = await page
    .locator("dialog strong > span")
    .evaluateAll((spans) =>
      spans.map((word) =>
        [...word.children].map((letter) => (letter as HTMLElement).offsetTop),
      ),
    );
  // The title does wrap at this width, so the check below means something.
  expect(new Set(words.map((tops) => tops[0])).size).toBeGreaterThan(1);
  for (const tops of words) expect(new Set(tops).size).toBe(1);
});
