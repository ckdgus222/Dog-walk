import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";

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

test("비회원 홈에 소개 세 줄과 로그인 카드가 있고 산책 그림 대신 들판이 보인다", async ({
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

  // Decorative images have no accessible name; identify the visible field asset.
  const scene = main.locator('[aria-hidden="true"]').filter({
    has: page.locator('img[src*="field."]'),
  });
  await expect(scene).toHaveCount(1);
  await expect(scene.locator('img[src*="field."]')).toBeVisible();
  await expect(main.locator('img[src*="home-scene"]')).toHaveCount(0);
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

test("로그인한 홈에는 들판 장면이 없고 기존 산책 그림이 보인다", async ({
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
  await expect(page.locator('img[src*="field."]')).toHaveCount(0);
  await expect(main.locator('img[src*="home-scene"]')).toBeVisible();
});
