import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// A new account, logged in through the API so the browser holds its cookie.
const loggedInAccount = async (context: BrowserContext) => {
  const id = `${Date.now().toString(36)}${randomUUID().slice(0, 4)}`;
  const account = {
    email: `profile-${id}@example.com`,
    nickname: `내정보${id}`.slice(0, 20),
    password: randomUUID().slice(0, 20),
  };
  const signup = await context.request.post("/api/auth/signup", {
    data: {
      ...account,
      dog: {
        name: "정보두부",
        breed: "푸들",
        size: "SMALL",
        gender: "FEMALE",
        neutered: true,
        birthYear: 2022,
        personality: "함께 걸어요.",
      },
    },
  });
  expect(signup.status()).toBe(201);
  const login = await context.request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(200);
  return account;
};

const greeting = (page: Page, nickname: string) =>
  page.getByRole("banner").getByText(`${nickname}님, 안녕하세요`);

const changePassword = async (
  page: Page,
  current: string,
  next: string,
  confirm = next,
) => {
  const main = page.getByRole("main");
  await main.getByLabel("현재 비밀번호", { exact: true }).fill(current);
  await main.getByLabel("새 비밀번호", { exact: true }).fill(next);
  await main.getByLabel("새 비밀번호 확인", { exact: true }).fill(confirm);
  await main
    .getByRole("button", { name: "비밀번호 바꾸기", exact: true })
    .click();
};

test("비밀번호 변경 응답을 기다려 로그아웃하고 새로고침해도 로그인되지 않는다", async ({
  page,
  context,
}) => {
  const account = await loggedInAccount(context);
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let saved!: (status: number) => void;
  const serverSaved = new Promise<number>((resolve) => (saved = resolve));
  const order: string[] = [];
  page.on("response", (response) => {
    if (
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === "/api/users/me"
    ) {
      order.push("password response");
    }
  });
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/auth/logout") {
      order.push("logout request");
    }
  });
  await page.route("**/api/users/me", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch();
    saved(response.status());
    await held;
    await route.fulfill({ response });
  });
  await page.goto("/me");
  try {
    await changePassword(page, account.password, "changed-pass-3");
    expect(await serverSaved).toBe(200);
    const logout = page.getByRole("banner").getByRole("button", {
      name: "로그아웃",
      exact: true,
    });
    await logout.click();
    await expect(logout).toBeDisabled();
    expect(order).toEqual([]);
    const loggedOut = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/logout",
    );
    release();
    expect((await loggedOut).status()).toBe(204);
    await expect(
      page.getByRole("main").getByRole("link", { name: "로그인", exact: true }),
    ).toBeVisible();
    expect(order).toEqual(["password response", "logout request"]);

    const refreshed = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/auth/refresh",
    );
    await page.reload();
    expect((await refreshed).status()).toBe(401);
    await expect(
      page.getByRole("main").getByRole("link", { name: "로그인", exact: true }),
    ).toBeVisible();
    await expect(greeting(page, account.nickname)).toHaveCount(0);
  } finally {
    release();
  }
});

test("로그아웃 요청이 실패하면 로그인 상태와 안내가 남고, 다시 누르면 로그아웃된다", async ({
  page,
  context,
}) => {
  const account = await loggedInAccount(context);
  await page.goto("/me");
  await expect(greeting(page, account.nickname)).toBeVisible();
  await page.route("**/api/auth/logout", (route) => route.abort("failed"));
  const header = page.getByRole("banner");
  const logout = header.getByRole("button", { name: "로그아웃", exact: true });
  await logout.click();
  await expect(header.getByRole("alert")).toHaveText(
    "로그아웃하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  );
  await expect(greeting(page, account.nickname)).toBeVisible();
  await expect(logout).toBeEnabled();

  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/refresh",
  );
  await page.reload();
  expect((await refreshed).status()).toBe(200);
  await expect(greeting(page, account.nickname)).toBeVisible();

  await page.unroute("**/api/auth/logout");
  const loggedOut = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/logout",
  );
  await logout.click();
  expect((await loggedOut).status()).toBe(204);
  await expect(
    page.getByRole("main").getByRole("link", { name: "로그인", exact: true }),
  ).toBeVisible();

  const refreshRejected = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/auth/refresh",
  );
  await page.reload();
  expect((await refreshRejected).status()).toBe(401);
  await expect(
    page.getByRole("main").getByRole("link", { name: "로그인", exact: true }),
  ).toBeVisible();
  await expect(greeting(page, account.nickname)).toHaveCount(0);
});

test("헤더의 내 정보에서 닉네임을 바꾸면 헤더 인사가 바로 바뀌고 새로고침해도 남는다", async ({
  page,
  context,
}) => {
  const account = await loggedInAccount(context);
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("link", { name: "내 정보", exact: true })
    .click();
  await expect(page).toHaveURL("/me");
  const main = page.getByRole("main");
  // The email is shown, not editable.
  await expect(main.getByText(account.email)).toBeVisible();
  await expect(main.getByRole("textbox", { name: /이메일/ })).toHaveCount(0);

  const nickname = `새이름${randomUUID().slice(0, 6)}`;
  await main.getByLabel("닉네임", { exact: true }).fill(nickname);
  await main.getByRole("button", { name: "닉네임 저장", exact: true }).click();
  await expect(main.getByText("닉네임을 바꿨어요.")).toBeVisible();
  await expect(greeting(page, nickname)).toBeVisible();

  await page.reload();
  await expect(greeting(page, nickname)).toBeVisible();
});

test("현재 비밀번호가 틀리면 오류를 보이고 로그인은 그대로이며, 새 비밀번호가 다르면 요청하지 않는다", async ({
  page,
  context,
}) => {
  const account = await loggedInAccount(context);
  await page.goto("/me");
  const main = page.getByRole("main");

  let patches = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PATCH" &&
      new URL(request.url()).pathname === "/api/users/me"
    )
      patches++;
  });
  await changePassword(page, account.password, "new-password-1", "other-1");
  await expect(main.getByRole("alert")).toHaveText(
    "새 비밀번호가 서로 달라요.",
  );
  expect(patches).toBe(0);

  await changePassword(page, "not-the-password", "new-password-1");
  await expect(main.getByRole("alert")).toHaveText(
    "현재 비밀번호가 맞지 않아요.",
  );
  expect(patches).toBe(1);
  await page.reload();
  await expect(greeting(page, account.nickname)).toBeVisible();
});

test("비밀번호를 바꾸면 이 브라우저는 로그인이 이어지고 새 비밀번호로 다시 로그인할 수 있다", async ({
  page,
  context,
  browser,
}) => {
  const account = await loggedInAccount(context);
  await page.goto("/me");
  const main = page.getByRole("main");
  await changePassword(page, account.password, "changed-pass-1");
  await expect(main.getByText("비밀번호를 바꿨어요.")).toBeVisible();
  await expect(main.getByLabel("현재 비밀번호", { exact: true })).toHaveValue(
    "",
  );

  // A reload signs in again with the refresh cookie the change replaced.
  await page.reload();
  await expect(greeting(page, account.nickname)).toBeVisible();

  const fresh = await browser.newContext();
  try {
    const login = await fresh.request.post("/api/auth/login", {
      data: { email: account.email, password: "changed-pass-1" },
    });
    expect(login.status()).toBe(200);
  } finally {
    await fresh.close();
  }
});

test("비밀번호를 바꾸는 동안 닉네임 저장도 막히고, 늦게 온 응답이 헤더 닉네임을 바꾸지 않는다", async ({
  page,
  context,
}) => {
  const account = await loggedInAccount(context);
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/users/me", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await held;
    await route.continue();
  });
  await page.goto("/me");
  const main = page.getByRole("main");
  const saveNickname = main.getByRole("button", {
    name: "닉네임 저장",
    exact: true,
  });
  await changePassword(page, account.password, "changed-pass-2");

  await expect(saveNickname).toBeDisabled();
  release();
  await expect(main.getByText("비밀번호를 바꿨어요.")).toBeVisible();
  await expect(saveNickname).toBeEnabled();
  await expect(greeting(page, account.nickname)).toBeVisible();
});
