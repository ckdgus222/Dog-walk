import { expect, test } from "@playwright/test";

test("로그인 전 다섯 주 메뉴는 이동 없이 안내를 보여 주고 닫을 수 있다", async ({
  page,
}) => {
  await page.goto("/");
  const menu = page.getByRole("navigation", { name: "주 메뉴" });
  const notice = page.getByRole("banner").getByRole("status");

  for (const name of [
    "게시판",
    "주변 친구",
    "산책 요청",
    "내 반려견",
    "산책 일기",
  ]) {
    await test.step(name, async () => {
      const link = menu.getByRole("link", { name, exact: true });
      await link.click();
      await expect(notice).toContainText("로그인 후 이용할 수 있어요.");
      await expect(notice).toBeVisible();
      await expect(page).toHaveURL("/");

      await link.click();
      await expect(notice).toHaveCount(1);
      await expect(page).toHaveURL("/");

      await notice.getByRole("button", { name: "닫기", exact: true }).click();
      await expect(notice).toHaveCount(0);
    });
  }
});

test("안내의 로그인 링크로 이동한 뒤 홈에 돌아와도 안내가 다시 나타나지 않는다", async ({
  page,
}) => {
  await page.goto("/");
  const header = page.getByRole("banner");
  const notice = header.getByRole("status");
  const board = page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "게시판", exact: true });

  await board.click();
  await expect(notice).toBeVisible();
  await notice.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await board.click();
  await expect(notice).toBeVisible();
  await notice.getByRole("link", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL("/login");
  await expect(notice).toHaveCount(0);

  await header.getByRole("link", { name: "강아지 산책", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(notice).toHaveCount(0);
});

test("로그인 전 주 메뉴에서 Enter를 누르면 이동 없이 안내를 보여 준다", async ({
  page,
}) => {
  await page.goto("/");
  const board = page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "게시판", exact: true });
  await board.focus();
  await expect(board).toBeFocused();
  await page.keyboard.press("Enter");
  const notice = page.getByRole("banner").getByRole("status");
  await expect(notice).toContainText("로그인 후 이용할 수 있어요.");
  await expect(notice).toBeVisible();
  // The notice appears before a navigation would finish, so keep using it:
  // a page change in between would remove it and fail the click.
  await notice.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(notice).toHaveCount(0);
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
    await expect(page.getByRole("banner").getByRole("status")).toHaveCount(0);
  } finally {
    await tab.close();
  }
});
