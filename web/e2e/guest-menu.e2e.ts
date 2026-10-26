import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const loginWindow = (page: Page) =>
  page.getByRole("dialog", { name: "로그인", exact: true });

const menuLink = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name, exact: true });

test("로그인 전 다섯 주 메뉴는 이동 없이 경고가 있는 로그인 창을 열고 닫을 수 있다", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = loginWindow(page);

  for (const name of [
    "게시판",
    "주변 친구",
    "산책 요청",
    "내 반려견",
    "산책 일기",
  ]) {
    await test.step(name, async () => {
      await menuLink(page, name).click();
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("alert")).toHaveText(
        "로그인 후 이용할 수 있어요.",
      );
      await expect(dialog.getByLabel("이메일", { exact: true })).toBeVisible();
      await expect(page).toHaveURL("/");

      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL("/");
    });
  }
});

test("로그인 창의 회원가입으로 옮겨 간 뒤 회원가입 창을 닫으면 원래 페이지로 돌아온다", async ({
  page,
}) => {
  await page.goto("/");
  await menuLink(page, "게시판").click();
  await loginWindow(page)
    .getByRole("link", { name: "회원가입", exact: true })
    .click();

  await expect(page).toHaveURL("/signup");
  await expect(loginWindow(page)).toHaveCount(0);
  const signup = page.getByRole("dialog", { name: "회원가입", exact: true });
  await expect(signup).toBeVisible();
  await signup.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("회원가입 페이지에서 연 로그인 창의 회원가입을 누르면 창만 닫히고 회원가입 폼을 쓸 수 있다", async ({
  page,
}) => {
  await page.goto("/signup");
  await menuLink(page, "게시판").click();
  await expect(loginWindow(page)).toBeVisible();
  await loginWindow(page)
    .getByRole("link", { name: "회원가입", exact: true })
    .click();

  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL("/signup");
  const email = page.getByRole("main").getByLabel("이메일", { exact: true });
  await email.fill("someone@example.com");
  await expect(email).toHaveValue("someone@example.com");
});

test("로그인 창에서 로그인하면 지금 페이지에 그대로 있고 로그인 헤더가 보인다", async ({
  page,
  context,
}) => {
  const id = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const account = {
    email: `guest-menu-${id}@example.com`,
    nickname: `메뉴${id}`,
    password: randomUUID().slice(0, 20),
  };
  const signup = await context.request.post("/api/auth/signup", {
    data: {
      ...account,
      dog: {
        name: "메뉴두부",
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

  await page.goto("/");
  await menuLink(page, "게시판").click();
  const dialog = loginWindow(page);
  await dialog.getByLabel("이메일", { exact: true }).fill(account.email);
  await dialog.getByLabel("비밀번호", { exact: true }).fill(account.password);
  await dialog.getByRole("button", { name: "로그인", exact: true }).click();

  await expect(
    page.getByRole("banner").getByText(`${account.nickname}님, 안녕하세요`),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL("/");
});

test("로그인 전 주 메뉴에서 Enter를 누르면 이동 없이 로그인 창을 연다", async ({
  page,
}) => {
  await page.goto("/");
  const board = menuLink(page, "게시판");
  await board.focus();
  await expect(board).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = loginWindow(page);
  await expect(dialog.getByRole("alert")).toHaveText(
    "로그인 후 이용할 수 있어요.",
  );
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL("/");
});

test("로그인 전에도 보조키 클릭은 안내 없이 새 탭으로 메뉴를 연다", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const newPage = context.waitForEvent("page");
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "게시판", exact: true })
    .click({ modifiers: ["ControlOrMeta"] });
  const tab = await newPage;

  try {
    await expect(tab).toHaveURL("/posts");
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    await tab.close();
  }
});
