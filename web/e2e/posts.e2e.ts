import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const createAccount = async (request: APIRequestContext) => {
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const account = {
    email: `board-${runId}@example.com`,
    nickname: `게시판${runId}`,
    password: randomUUID().slice(0, 20),
  };
  const signup = await request.post("/api/auth/signup", {
    data: {
      ...account,
      dog: {
        name: "보리",
        breed: "푸들",
        size: "SMALL",
        gender: "MALE",
        neutered: true,
        birthYear: 2021,
        personality: "산책을 좋아해요.",
      },
    },
  });
  expect(signup.status()).toBe(201);
  const login = await request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(200);
  return {
    ...account,
    headers: { Authorization: `Bearer ${(await login.json()).accessToken}` },
  };
};

const login = async (
  page: Page,
  account: { email: string; password: string },
) => {
  await page.goto("/login");
  const main = page.getByRole("main");
  await main.getByLabel("이메일").fill(account.email);
  await main.getByLabel("비밀번호").fill(account.password);
  await main.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL("/");
};

test("게시판 작성·댓글·작성자 권한·삭제·페이지 이동", async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(60_000);
  const author = await createAccount(request);
  const other = await createAccount(request);
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const main = page.getByRole("main");
  const title = `산책 ${randomUUID()}`;
  const updatedTitle = `수정 ${randomUUID()}`;
  const content = "첫째 줄\n둘째 줄 <b>그대로 표시</b>";
  const authorComment = `작성자 댓글 ${randomUUID()}`;
  let postPath = "";

  try {
    await test.step("A가 글과 댓글을 작성하고 목록에서 댓글 수를 확인한 뒤 글을 수정한다", async () => {
      await login(page, author);
      await page
        .getByRole("navigation", { name: "주 메뉴" })
        .getByRole("link", { name: "게시판", exact: true })
        .click();
      await expect(page).toHaveURL("/posts");
      await main.getByRole("link", { name: "글쓰기", exact: true }).click();
      await expect(page).toHaveURL("/posts/new");
      await main.getByLabel("제목", { exact: true }).fill(title);
      await main.getByRole("textbox", { name: /^본문/ }).fill(content);
      await main.getByRole("button", { name: "저장하기" }).click();
      await expect(page).toHaveURL(/\/posts\/\d+$/);
      postPath = new URL(page.url()).pathname;
      const article = main.getByRole("article", {
        name: "게시글",
        exact: true,
      });
      await expect(
        article.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      const body = article.getByText(content, { exact: true });
      await expect(body).toBeVisible();
      await expect(body).toHaveCSS("white-space", "pre-wrap");
      expect(await body.textContent()).toBe(content);
      await expect(article.locator("b")).toHaveCount(0);
      await main
        .getByRole("textbox", { name: /^댓글 내용/ })
        .fill(authorComment);
      await main.getByRole("button", { name: "댓글 달기" }).click();
      await expect(
        main
          .getByRole("region", { name: "댓글", exact: true })
          .getByText(authorComment, { exact: true }),
      ).toBeVisible();
      await main.getByRole("link", { name: "게시판", exact: true }).click();
      await expect(page).toHaveURL("/posts");
      await expect(
        main.getByRole("link", { name: `${title} [1]`, exact: true }),
      ).toBeVisible();
      await main
        .getByRole("link", { name: `${title} [1]`, exact: true })
        .click();
      await expect(page).toHaveURL(postPath);
      await article.getByRole("link", { name: "글 수정", exact: true }).click();
      await expect(page).toHaveURL(`${postPath}/edit`);
      await expect(main.getByLabel("제목", { exact: true })).toHaveValue(title);
      await main.getByLabel("제목", { exact: true }).fill(updatedTitle);
      await main.getByRole("button", { name: "저장하기" }).click();
      await expect(page).toHaveURL(postPath);
      await expect(
        article.getByRole("heading", { name: updatedTitle, exact: true }),
      ).toBeVisible();
    });

    await test.step("B는 자기 댓글만 수정·삭제할 수 있다", async () => {
      await login(otherPage, other);
      await otherPage.goto(postPath);
      const otherMain = otherPage.getByRole("main");
      await expect(
        otherMain.getByRole("heading", { name: updatedTitle, exact: true }),
      ).toBeVisible();
      const comments = otherMain.getByRole("region", {
        name: "댓글",
        exact: true,
      });
      await expect(
        comments.getByText(authorComment, { exact: true }),
      ).toBeVisible();
      await expect(
        otherMain.getByRole("link", { name: "글 수정", exact: true }),
      ).toHaveCount(0);
      await expect(
        otherMain.getByRole("button", { name: "수정", exact: true }),
      ).toHaveCount(0);
      await expect(
        otherMain.getByRole("button", { name: "삭제", exact: true }),
      ).toHaveCount(0);
      const ownContent = `B 댓글 ${randomUUID()}`;
      await comments
        .getByRole("textbox", { name: /^댓글 내용/ })
        .fill(ownContent);
      await comments.getByRole("button", { name: "댓글 달기" }).click();
      const ownComment = comments
        .getByRole("article")
        .filter({ hasText: other.nickname });
      await expect(
        ownComment.getByText(ownContent, { exact: true }),
      ).toBeVisible();
      await expect(
        comments.getByRole("button", { name: "수정", exact: true }),
      ).toHaveCount(1);
      await expect(
        comments.getByRole("button", { name: "삭제", exact: true }),
      ).toHaveCount(1);
      await ownComment
        .getByRole("button", { name: "수정", exact: true })
        .click();
      await ownComment
        .getByRole("textbox", { name: /^댓글 수정/ })
        .fill("취소할 댓글");
      await ownComment
        .getByRole("button", { name: "취소", exact: true })
        .click();
      await expect(
        ownComment.getByText(ownContent, { exact: true }),
      ).toBeVisible();
      await ownComment
        .getByRole("button", { name: "수정", exact: true })
        .click();
      await ownComment
        .getByRole("textbox", { name: /^댓글 수정/ })
        .fill(`${ownContent} 수정`);
      await ownComment
        .getByRole("button", { name: "저장", exact: true })
        .click();
      await expect(
        ownComment.getByText(`${ownContent} 수정`, { exact: true }),
      ).toBeVisible();
      otherPage.once("dialog", (dialog) => dialog.accept());
      await ownComment
        .getByRole("button", { name: "삭제", exact: true })
        .click();
      await expect(ownComment).toHaveCount(0);
      await expect(
        comments.getByText(authorComment, { exact: true }),
      ).toBeVisible();
    });

    await test.step("A가 글을 삭제하면 목록에서 사라진다", async () => {
      page.once("dialog", (dialog) => dialog.accept());
      await main
        .getByRole("article", { name: "게시글", exact: true })
        .getByRole("button", { name: "삭제", exact: true })
        .click();
      await expect(page).toHaveURL("/posts");
      await expect(
        main.getByRole("link", { name: `${updatedTitle} [1]`, exact: true }),
      ).toHaveCount(0);
      await expect(
        main.getByRole("article").filter({ hasText: updatedTitle }),
      ).toHaveCount(0);
    });

    await test.step("페이지 번호를 주소로 유지하고 범위 밖에서 마지막 페이지로 이동한다", async () => {
      for (let index = 0; index < 21; index++) {
        const created = await request.post("/api/posts", {
          headers: author.headers,
          data: {
            title: `페이지 ${index} ${randomUUID()}`,
            content: "페이지 확인",
          },
        });
        expect(created.status()).toBe(201);
      }
      await page.goto("/posts");
      await main.getByRole("link", { name: "다음", exact: true }).click();
      await expect(page).toHaveURL("/posts?page=2");
      await expect(
        main.getByRole("navigation", { name: "게시판 페이지" }),
      ).toContainText(/2 \/ \d+/);
      await page.reload();
      await expect(page).toHaveURL("/posts?page=2");
      await expect(
        main.getByRole("navigation", { name: "게시판 페이지" }),
      ).toContainText(/2 \/ \d+/);
      await main.getByRole("link", { name: "이전", exact: true }).click();
      await expect(page).toHaveURL("/posts?page=1");
      await expect(
        main.getByRole("navigation", { name: "게시판 페이지" }),
      ).toContainText(/1 \/ \d+/);
      await page.goto("/posts?page=100000");
      await expect(
        main.getByText("이 페이지에는 글이 없어요.", { exact: true }),
      ).toBeVisible();
      await expect(
        main.getByRole("navigation", { name: "게시판 페이지" }),
      ).toHaveCount(0);
      const lastPageLink = main.getByRole("link", {
        name: "마지막 페이지로",
        exact: true,
      });
      const href = await lastPageLink.getAttribute("href");
      expect(href).toMatch(/^\/posts\?page=\d+$/);
      const lastPage = new URL(href!, page.url()).searchParams.get("page");
      await lastPageLink.click();
      await expect(page).toHaveURL(href!);
      await expect(
        main.getByRole("navigation", { name: "게시판 페이지" }),
      ).toContainText(`${lastPage} / ${lastPage}`);
      await expect(
        main.getByRole("link", { name: "다음", exact: true }),
      ).toHaveCount(0);
    });
  } finally {
    await otherContext.close();
  }
});
