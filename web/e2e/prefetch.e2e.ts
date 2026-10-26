import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { Dog, Post } from "../lib/types";

const user = {
  id: 990001,
  email: "prefetch@example.test",
  nickname: "미리 읽기 확인",
};
const dog = (id: number): Dog => ({
  id,
  name: `반려견 ${id}`,
  breed: "푸들",
  size: "SMALL",
  gender: "MALE",
  neutered: true,
  birthYear: 2021,
  personality: "산책을 좋아해요.",
  photoUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const posts: Post[] = [2993, 2992, 2991, 2990, 2989].map((id) => ({
  id,
  title: `산책 이야기 ${id}`,
  content: "함께 걸었어요.",
  author: { id: 990002, nickname: "이웃" },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
}));

// Only API data is mocked. HTML, scripts and RSC responses come from the
// production build, where Next's automatic prefetch actually runs.
const mockApi = async (page: Page, signedIn = false) => {
  const state = { signedIn, dogs: [dog(5485)] };
  await page.route("**/api/**", async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/api/auth/login") state.signedIn = true;
    if (pathname === "/api/auth/login" || pathname === "/api/auth/refresh") {
      await route.fulfill({
        status: state.signedIn ? 200 : 401,
        json: state.signedIn
          ? { user, accessToken: "prefetch-test-only" }
          : { message: "로그인이 필요합니다." },
      });
      return;
    }
    if (pathname === "/api/dogs/me") {
      await route.fulfill({ json: state.dogs });
      return;
    }
    if (pathname === "/api/posts") {
      await route.fulfill({
        json: {
          posts: posts.map((post) => ({ ...post, commentCount: 0 })),
          page: 1,
          totalPages: 1,
        },
      });
      return;
    }
    if (/^\/api\/posts\/\d+\/comments$/.test(pathname)) {
      await route.fulfill({ json: [] });
      return;
    }
    const post = posts.find((entry) => pathname === `/api/posts/${entry.id}`);
    if (post) {
      await route.fulfill({ json: post });
      return;
    }
    if (pathname === "/api/diaries") {
      await route.fulfill({ json: { diaries: [], page: 1, totalPages: 1 } });
      return;
    }
    if (pathname === "/api/walk-requests/pending-count") {
      await route.fulfill({ json: { count: 0 } });
      return;
    }
    throw new Error(`Unexpected API request: ${pathname}`);
  });
  await page.route("**/socket.io/**", (route) => route.abort());
  return state;
};

const watchPrefetch = async (page: Page) => {
  const counts = new Map<string, number>();
  const blocked = new Set<string>();
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isRsc = url.searchParams.has("_rsc") || request.headers().rsc === "1";
    const isDetail = /^\/(?:dogs\/\d+\/edit|posts\/\d+)$/.test(url.pathname);
    if (!isRsc || !isDetail) {
      await route.fallback();
      return;
    }
    const count = (counts.get(url.pathname) ?? 0) + 1;
    counts.set(url.pathname, count);
    // Stop a broken build from hammering the server. Reaching this limit is
    // always a failure below, never treated as the requests becoming quiet.
    if (count > 40) {
      blocked.add(url.pathname);
      await route.abort();
      return;
    }
    await route.continue();
  });
  return { counts, blocked };
};

const expectQuietPrefetch = async (
  page: Page,
  monitor: Awaited<ReturnType<typeof watchPrefetch>>,
  testInfo: TestInfo,
) => {
  // A negative network assertion needs an observation window; an immediate
  // count would pass before the response->retry loop has even started.
  await page.waitForTimeout(4_000);
  const settled = Object.fromEntries(monitor.counts);
  await page.waitForTimeout(1_000);
  const final = Object.fromEntries(monitor.counts);
  const report = { afterFourSeconds: settled, afterFiveSeconds: final };
  console.info(JSON.stringify(report));
  await testInfo.attach("rsc-request-counts", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  expect([...monitor.blocked], "RSC request safety limit reached").toEqual([]);
  // Leave room for several legitimate segment requests, while rejecting a
  // repeated fetch of the same page even if the safety limit was not reached.
  for (const [path, count] of monitor.counts) {
    expect(count, `${path} RSC requests`).toBeLessThanOrEqual(20);
  }
  expect(final, "Idle detail links must stop sending RSC requests").toEqual(
    settled,
  );
};

const waitForRscResponse = (page: Page, path: string) =>
  page.waitForResponse((response) => {
    const request = response.request();
    const url = new URL(request.url());
    return (
      url.pathname === path &&
      (url.searchParams.has("_rsc") || request.headers().rsc === "1") &&
      response.ok()
    );
  });

test.use({ viewport: { width: 1440, height: 1000 } });

test("로그인 후 반려견과 게시판으로 이동해도 상세 화면을 계속 미리 읽지 않는다", async ({
  page,
}, testInfo) => {
  await mockApi(page);
  const monitor = await watchPrefetch(page);
  const knownPostResponse = waitForRscResponse(page, `/posts/${posts[0].id}`);
  await page.goto("/login");
  const main = page.getByRole("main");
  await main.getByLabel("이메일").fill(user.email);
  await main.getByLabel("비밀번호").fill("mock-password");
  await main.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(main.getByRole("link", { name: posts[0].title })).toBeVisible();
  // Warm a known post route on the home, then expose further post IDs on
  // /posts. No dog is added in this scenario.
  await main.getByRole("link", { name: posts[0].title }).hover();
  expect(await (await knownPostResponse).finished()).toBeNull();
  // Allow Next to decode the completed response and learn its route pattern.
  await page.waitForTimeout(1_000);
  const menu = page.getByRole("navigation", { name: "주 메뉴" });
  await menu.getByRole("link", { name: "내 반려견", exact: true }).click();
  await expect(main.getByRole("article")).toHaveCount(1);
  await menu.getByRole("link", { name: "게시판", exact: true }).click();
  await expect(main.getByRole("article")).toHaveCount(posts.length);
  await expectQuietPrefetch(page, monitor, testInfo);
  await main.getByRole("link", { name: posts[3].title, exact: true }).click();
  await expect(page).toHaveURL(`/posts/${posts[3].id}`);
  await expect(
    main.getByRole("heading", { name: posts[3].title }),
  ).toBeVisible();
});

test("새 반려견이 목록에 나타나도 수정 화면을 계속 미리 읽지 않는다", async ({
  page,
}, testInfo) => {
  const state = await mockApi(page, true);
  const monitor = await watchPrefetch(page);
  const knownDogResponse = waitForRscResponse(page, "/dogs/5485/edit");
  await page.goto("/dogs");
  const main = page.getByRole("main");
  await expect(main.getByRole("article")).toHaveCount(1);
  await main.getByRole("link", { name: "수정", exact: true }).hover();
  expect(await (await knownDogResponse).finished()).toBeNull();
  await page.waitForTimeout(1_000);
  await main.getByRole("link", { name: "반려견 추가", exact: true }).click();
  await expect(page).toHaveURL("/dogs/new");
  state.dogs.push(dog(11768));
  await main.getByRole("link", { name: "내 반려견", exact: true }).click();
  await expect(main.getByRole("article")).toHaveCount(2);
  await expectQuietPrefetch(page, monitor, testInfo);
  await main
    .getByRole("article")
    .filter({ hasText: "반려견 11768" })
    .getByRole("link", { name: "수정", exact: true })
    .click();
  await expect(page).toHaveURL("/dogs/11768/edit");
  await expect(main.getByLabel("이름", { exact: true })).toHaveValue(
    "반려견 11768",
  );
});
