import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

test.use({ reducedMotion: "no-preference" });

// Decorative scenes have no accessible name; distinguish them by the field asset.
const fieldSceneSelector = '[aria-hidden="true"]:has(img[src*="field."])';
const backgroundDogsSelector = ':scope > div:has(img[src*="-run-1."])';

const createAccount = async (request: APIRequestContext) => {
  const id = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const account = {
    email: `guest-home-${id}@example.com`,
    nickname: `홈${id}`,
    password: randomUUID().slice(0, 20),
  };
  const response = await request.post("/api/auth/signup", {
    data: {
      ...account,
      dog: {
        name: "홈두부",
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

test("비회원 홈에 소개 세 줄과 로그인 카드, 들판 배경과 강변 산책 그림이 있다", async ({
  page,
}) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", {
      level: 1,
      name: "오늘도, 좋은 산책이 기다리고 있어요",
      exact: true,
    }),
  ).toBeVisible();
  const features = main.getByRole("list").getByRole("listitem");
  await expect(features).toHaveCount(3);
  for (const [name, detail] of [
    ["주변 산책 친구 찾기", "가까운 반려인을 지도에서 찾아요"],
    ["산책 일기", "우리 아이와의 산책을 기록해요"],
    ["이웃 게시판", "동네 반려인과 이야기를 나눠요"],
  ]) {
    const feature = features.filter({ hasText: name });
    await expect(feature.getByText(name, { exact: true })).toBeVisible();
    await expect(feature.getByText(detail, { exact: true })).toBeVisible();
  }

  const card = main.locator("section").filter({
    has: page.getByRole("heading", { level: 2, name: "로그인", exact: true }),
  });
  await expect(card.getByRole("heading", { level: 2 })).toBeVisible();
  await expect(card.getByLabel("이메일", { exact: true })).toBeVisible();
  await expect(card.getByLabel("비밀번호", { exact: true })).toBeVisible();
  await expect(
    card.getByRole("button", { name: "로그인", exact: true }),
  ).toBeEnabled();
  await expect(card.getByText("처음이세요?", { exact: false })).toBeVisible();
  await expect(
    card.getByRole("link", { name: "회원가입", exact: true }),
  ).toHaveAttribute("href", "/signup");
  await expect(card.getByRole("link", { name: "홈으로" })).toHaveCount(0);

  const scene = page.locator(fieldSceneSelector);
  await expect(scene).toHaveCount(1);
  await expect(scene.locator('img[src*="field."]')).toBeVisible();
  await expect(main.locator('img[src*="home-scene"]')).toBeVisible();
});

test("홈 카드에서 로그인하면 주소가 그대로이고 대시보드가 보인다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("이메일").fill(account.email);
  await main.getByLabel("비밀번호").fill(account.password);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await main.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();
  await expect(page).toHaveURL("/");
  await expect(main.getByText("홈두부", { exact: true })).toBeVisible();
  await expect(
    main.getByRole("link", { name: "내 반려견", exact: true }),
  ).toBeVisible();
  await expect(main.getByLabel("이메일")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("로그인하면 환영 문구가 헤더 밖에 잠깐 보이고, 로그인된 채 새로고침하면 보이지 않는다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByLabel("이메일").fill(account.email);
  await main.getByLabel("비밀번호").fill(account.password);
  await main.getByRole("button", { name: "로그인", exact: true }).click();

  const welcome = page.getByText(`${account.nickname}님, 환영해요!`, {
    exact: true,
  });
  await expect(welcome).toBeVisible();
  // Live notices own the header's status messages.
  await expect(page.getByRole("banner").getByRole("status")).toHaveCount(0);
  await expect(welcome).toHaveCount(0, { timeout: 6_000 });

  await page.reload();
  await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();
  // Checked once, not retried: a retried check would wait out the 3 s and
  // pass even if the welcome had shown. The greeting and the welcome render
  // from the same login, so once the greeting shows the welcome would too.
  expect(await welcome.count()).toBe(0);
});

test("홈 카드의 회원가입 링크는 회원가입 모달을 연다", async ({ page }) => {
  await page.goto("/");
  const main = page.getByRole("main");
  await main.getByRole("link", { name: "회원가입", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "회원가입", exact: true });
  await expect(page).toHaveURL("/signup");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("이메일", { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "가입하기", exact: true }),
  ).toBeVisible();
});

test("로그인한 홈에는 들판 배경과 강변 산책 그림이 함께 있다", async ({
  page,
  context,
}) => {
  const account = await createAccount(context.request);
  const response = await context.request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(response.status()).toBe(200);
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();
  await expect(main.getByText("홈두부", { exact: true })).toBeVisible();
  const scene = page.locator(fieldSceneSelector);
  await expect(scene).toHaveCount(1);
  await expect(scene.locator('img[src*="field."]')).toBeVisible();
  const homeScene = main.locator('img[src*="home-scene"]');
  await expect(homeScene).toHaveCount(1);
  await expect(homeScene).toBeVisible();
});

test("로그인한 홈은 최근 산책 일기와 게시판 새 글을 카드로 보여 준다", async ({
  page,
  context,
}) => {
  const account = await createAccount(context.request);
  const response = await context.request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(response.status()).toBe(200);
  const headers = {
    Authorization: `Bearer ${(await response.json()).accessToken}`,
  };
  const main = page.getByRole("main");
  const card = (name: string) =>
    main.locator("section").filter({
      has: page.getByRole("heading", { level: 2, name, exact: true }),
    });

  // A new account has no diary yet, so the card invites the first one.
  await page.goto("/");
  await expect(card("산책 일기")).toContainText("첫 산책을 기록해 보세요.");
  await expect(
    card("산책 일기").getByRole("link", { name: "일기 쓰기", exact: true }),
  ).toHaveAttribute("href", "/diaries/new");

  const dogs = await context.request.get("/api/dogs/me", { headers });
  const [dog] = (await dogs.json()) as { id: number }[];
  const diary = await context.request.post("/api/diaries", {
    headers,
    multipart: {
      diary: JSON.stringify({
        dogId: dog.id,
        title: "홈에서 보는 산책",
        walkedOn: "2020-10-21",
        content: "홈 카드에 나오는 일기",
      }),
    },
  });
  expect(diary.status()).toBe(201);
  const diaryId = (await diary.json()).id as number;

  await page.reload();
  await expect(
    card("산책 일기").getByRole("link", { name: /홈에서 보는 산책/ }),
  ).toHaveAttribute("href", `/diaries/${diaryId}`);
  // Other tests write posts at the same time, so check the shape of the
  // newest three instead of which posts they are.
  const posts = card("게시판").getByRole("listitem").getByRole("link");
  await expect(posts.first()).toBeVisible();
  expect(await posts.count()).toBeLessThanOrEqual(3);
  for (const link of await posts.all()) {
    await expect(link).toHaveAttribute("href", /^\/posts\/\d+$/);
  }
});

test("게시판을 직접 열어도 들판 배경은 하나이고 강아지는 숨겨진다", async ({
  page,
}) => {
  await page.goto("/posts");
  await expect(
    page.getByRole("main").getByRole("heading", { name: "게시판", exact: true }),
  ).toBeVisible();
  const scene = page.locator(fieldSceneSelector);
  await expect(scene).toHaveCount(1);
  await expect(scene.locator('img[src*="field."]')).toBeVisible();
  const dogs = scene.locator(backgroundDogsSelector);
  await expect(dogs).toHaveCount(2);
  for (const dog of await dogs.all()) {
    await expect(dog).toBeHidden();
    await expect(dog).toHaveCSS("display", "none");
  }
});

test("로그인한 홈에서 게시판으로 갔다 뒤로 가면 배경 강아지가 보임·숨김·보임으로 바뀐다", async ({
  page,
  context,
}) => {
  const account = await createAccount(context.request);
  const response = await context.request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(response.status()).toBe(200);
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();
  const scene = page.locator(fieldSceneSelector);
  await expect(scene).toHaveCount(1);
  const dogs = scene.locator(backgroundDogsSelector);
  await expect(dogs).toHaveCount(2);
  // Dogs move outside the viewport between runs; check visibility, not position.
  for (const dog of await dogs.all()) {
    await expect(dog).toBeVisible();
    await expect(dog).toHaveCSS("opacity", "1");
  }

  await main.getByRole("link", { name: "게시판", exact: true }).click();
  await expect(page).toHaveURL("/posts");
  await expect(
    main.getByRole("heading", { name: "게시판", exact: true }),
  ).toBeVisible();
  await expect(scene).toHaveCount(1);
  await expect(scene.locator('img[src*="field."]')).toBeVisible();
  await expect(dogs).toHaveCount(2);
  for (const dog of await dogs.all()) {
    await expect(dog).toBeHidden();
    await expect(dog).toHaveCSS("display", "none");
  }

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();
  await expect(scene).toHaveCount(1);
  await expect(dogs).toHaveCount(2);
  for (const dog of await dogs.all()) {
    await expect(dog).toBeVisible();
    await expect(dog).toHaveCSS("opacity", "1");
  }
});

test("로그인·앱 안 이동·로그아웃 뒤에도 들판 배경은 같은 요소로 남는다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  await page.goto("/");
  const main = page.getByRole("main");
  await expect(main.getByLabel("이메일")).toBeVisible();
  const scene = page.locator(fieldSceneSelector);
  await expect(scene).toHaveCount(1);
  await expect(scene.locator('img[src*="field."]')).toBeVisible();
  const originalScene = await scene.evaluateHandle((element) => element);
  const expectSameScene = async () => {
    await expect(scene).toHaveCount(1);
    expect(
      await scene.evaluate(
        (element, original) => element === original && original.isConnected,
        originalScene,
      ),
    ).toBe(true);
  };

  try {
    await main.getByLabel("이메일").fill(account.email);
    await main.getByLabel("비밀번호").fill(account.password);
    await main.getByRole("button", { name: "로그인", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();
    await expectSameScene();

    await main.getByRole("link", { name: "게시판", exact: true }).click();
    await expect(page).toHaveURL("/posts");
    await expect(
      main.getByRole("heading", { name: "게시판", exact: true }),
    ).toBeVisible();
    await expectSameScene();

    await page
      .getByRole("banner")
      .getByRole("link", { name: "강아지 산책", exact: true })
      .click();
    await expect(page).toHaveURL("/");
    await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();
    await expectSameScene();

    await page
      .getByRole("banner")
      .getByRole("button", { name: "로그아웃", exact: true })
      .click();
    await expect(main.getByLabel("이메일")).toBeVisible();
    await expect(
      main.getByRole("button", { name: "로그인", exact: true }),
    ).toBeEnabled();
    await expect(page).toHaveURL("/");
    await expectSameScene();
  } finally {
    await originalScene.dispose();
  }
});

test("1920px 창에서 로그인한 글쓰기·일기 쓰기·반려견 추가 판의 보이는 폭은 홈과 같은 1680px이다", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const account = await createAccount(context.request);
  const response = await context.request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(response.status()).toBe(200);

  for (const { path, heading, width } of [
    { path: "/posts/new", heading: "글쓰기", width: 1680 },
    { path: "/diaries/new", heading: "오늘의 산책을 기록해요", width: 1680 },
    { path: "/dogs/new", heading: "반려견 추가", width: 1680 },
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(path);
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { level: 1, name: heading, exact: true }),
    ).toBeVisible();
    // The heading shows before the login check ends, and the page is built
    // again once it ends, so measure until the settled panel answers.
    await expect
      .poll(
        async () =>
          Math.abs(
            (await main.evaluate(
              (element) => element.getBoundingClientRect().width,
            )) - width,
          ),
        { message: `${path} 판의 폭 오차` },
      )
      .toBeLessThanOrEqual(1);
  }
});

for (const width of [1920, 2560]) {
  test(`${width}px 창에서 로그인한 홈과 게시판 내용 판의 보이는 폭은 1680px 이하이다`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 1080 });
    const account = await createAccount(context.request);
    const response = await context.request.post("/api/auth/login", {
      data: { email: account.email, password: account.password },
    });
    expect(response.status()).toBe(200);
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();

    const homeWidth = await main.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(homeWidth).toBeGreaterThanOrEqual(1679);
    expect(homeWidth).toBeLessThanOrEqual(1680);

    await main.getByRole("link", { name: "게시판", exact: true }).click();
    await expect(page).toHaveURL("/posts");
    await expect(
      main.getByRole("heading", { name: "게시판", exact: true }),
    ).toBeVisible();
    const postsWidth = await main.evaluate(
      (element) => element.getBoundingClientRect().width,
    );
    expect(postsWidth).toBeGreaterThanOrEqual(1679);
    expect(postsWidth).toBeLessThanOrEqual(1680);
  });
}
