import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

// The diary textarea and dog select sit inside their labels, so their text
// becomes part of the label's accessible name ("글 처음 쓴 일기",
// "반려견 두부"). Match names by their first word.
// After every link click the test waits for the new URL: Next.js keeps the
// previous page on screen until the next one is ready, so acting right away
// can hit the old page (for example the list's dog filter).

const photoA = {
  name: "red.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAE0lEQVQImWP4z8DwnwGM/zMwAAAf7gP9qS/A4gAAAABJRU5ErkJggg==",
    "base64",
  ),
};
const photoB = {
  name: "blue.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWNgYPgPRmAKABf2A/38FIMyAAAAAElFTkSuQmCC",
    "base64",
  ),
};
const dog = {
  name: "보리",
  breed: "푸들",
  size: "SMALL",
  gender: "MALE",
  neutered: true,
  birthYear: 2021,
  personality: "산책을 좋아해요.",
};

const createAccount = async (request: APIRequestContext) => {
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const account = {
    email: `diary-${runId}@example.com`,
    nickname: `일기${runId}`,
    password: randomUUID().slice(0, 20),
  };
  expect(
    (
      await request.post("/api/auth/signup", { data: { ...account, dog } })
    ).status(),
  ).toBe(201);
  const login = await request.post("/api/auth/login", {
    data: { email: account.email, password: account.password },
  });
  expect(login.status()).toBe(200);
  const headers = {
    Authorization: `Bearer ${(await login.json()).accessToken}`,
  };
  const secondDog = await request.post("/api/dogs", {
    headers,
    multipart: { dog: JSON.stringify({ ...dog, name: "두부" }) },
  });
  expect(secondDog.status()).toBe(201);
  return { ...account, headers, dogId: (await secondDog.json()).id as number };
};

const login = async (
  page: Page,
  account: { email: string; password: string },
) => {
  const main = page.getByRole("main");
  await page.goto("/login");
  await main.getByLabel("이메일").fill(account.email);
  await main.getByLabel("비밀번호").fill(account.password);
  await main.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL("/");
};

const expectPhotos = async (page: Page, count: number) => {
  const images = page.getByRole("main").getByRole("img");
  await expect(images).toHaveCount(count);
  for (let index = 0; index < count; index++) {
    await expect(images.nth(index)).toBeVisible();
    await expect
      .poll(() =>
        images
          .nth(index)
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
  }
};

test("일기 사진 작성·수정·삭제와 반려견 삭제 제한", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const account = await createAccount(request);
  const main = page.getByRole("main");
  const menu = page.getByRole("navigation", { name: "주 메뉴" });
  const photoInput = main.getByLabel("사진 (최대 5장, 장당 5MB 이하)");
  let diaryUrl = "";

  await test.step("로그인 후 상단 메뉴에서 일기를 쓴다", async () => {
    await login(page, account);
    await menu.getByRole("link", { name: "산책 일기", exact: true }).click();
    await expect(page).toHaveURL("/diaries");
    await expect(main.getByText("아직 일기가 없어요.")).toBeVisible();
    await expect(
      main.getByRole("link", { name: "첫 일기 쓰기", exact: true }),
    ).toHaveAttribute("href", "/diaries/new");
    await main.getByRole("link", { name: "일기 쓰기", exact: true }).click();
    await expect(page).toHaveURL("/diaries/new");
    await main
      .getByRole("combobox", { name: /^반려견/ })
      .selectOption(String(account.dogId));
    await main.getByLabel("산책한 날짜").fill("2020-10-21");
    await main.getByRole("textbox", { name: "제목", exact: true }).fill("   ");
    await main
      .getByRole("textbox", { name: /^글/ })
      .fill("두부와 공원을 걸었어요.\n즐거운 산책이었어요.");
    await main.getByRole("button", { name: "저장하기", exact: true }).click();
    await expect(main.getByRole("alert")).toHaveText("제목을 입력해 주세요.");
    await main
      .getByRole("textbox", { name: "제목", exact: true })
      .fill("두부와 공원 산책");
    await photoInput.setInputFiles([photoA, photoB]);
    await main.getByRole("button", { name: "저장하기", exact: true }).click();
    await expect(page).toHaveURL(/\/diaries\/\d+$/);
    diaryUrl = new URL(page.url()).pathname;
    await expect(
      main.getByRole("heading", { name: "두부와 공원 산책", exact: true }),
    ).toBeVisible();
    await expectPhotos(page, 2);
  });

  await test.step("목록의 글·표지 사진·사진 수를 확인하고 사진 한 장을 교체한다", async () => {
    await main.getByRole("link", { name: "일기 목록", exact: true }).click();
    await expect(page).toHaveURL("/diaries");
    const card = main.getByRole("article");
    await expect(card).toHaveCount(1);
    await expect(
      card.getByRole("heading", { name: "두부와 공원 산책" }),
    ).toBeVisible();
    await expect(card.getByText("두부", { exact: true })).toBeVisible();
    await expect(card.getByText("사진 2장", { exact: true })).toBeVisible();
    // The card shows only the first photo; the badge counts all of them.
    await expectPhotos(page, 1);
    await card.getByRole("link").click();
    await expect(page).toHaveURL(/\/diaries\/\d+$/);
    await main.getByRole("link", { name: "수정", exact: true }).click();
    await expect(page).toHaveURL(/\/diaries\/\d+\/edit$/);
    await expect(main.getByRole("textbox", { name: /^일기 내용/ })).toHaveValue(
      "두부와 공원을 걸었어요.\n즐거운 산책이었어요.",
    );
    await main
      .getByRole("checkbox", { name: "이 사진 지우기" })
      .first()
      .check();
    await expect(
      main.getByRole("textbox", { name: "제목", exact: true }),
    ).toHaveValue("두부와 공원 산책");
    await main
      .getByRole("textbox", { name: "제목", exact: true })
      .fill("사진을 바꾼 산책");
    await photoInput.setInputFiles(photoA);
    await main
      .getByRole("textbox", { name: /^일기 내용/ })
      .fill("사진을 바꾼 일기예요.");
    await main.getByRole("button", { name: "저장하기", exact: true }).click();
    await expect(page).toHaveURL(diaryUrl);
    await expect(
      main.getByRole("heading", { name: "사진을 바꾼 산책" }),
    ).toBeVisible();
    await expect(
      main.getByText("사진을 바꾼 일기예요.", { exact: true }),
    ).toBeVisible();
    await expectPhotos(page, 2);
  });

  await test.step("사진 6장과 5MB 초과 파일은 요청 전에 막는다", async () => {
    await main.getByRole("link", { name: "수정", exact: true }).click();
    await expect(page).toHaveURL(/\/diaries\/\d+\/edit$/);
    await expect(main.getByRole("textbox", { name: /^일기 내용/ })).toHaveValue(
      "사진을 바꾼 일기예요.",
    );
    let patchRequests = 0;
    page.on("request", (req) => {
      if (
        req.method() === "PATCH" &&
        new URL(req.url()).pathname.startsWith("/api/diaries/")
      )
        patchRequests++;
    });
    await photoInput.setInputFiles([photoA, photoB, photoA, photoB]);
    await expect(main.getByRole("alert")).toHaveText(
      "사진은 일기 하나에 5장까지예요.",
    );
    await main.getByRole("button", { name: "저장하기", exact: true }).click();
    await expect(main.getByRole("alert")).toHaveText(
      "사진은 일기 하나에 5장까지예요.",
    );
    expect(patchRequests).toBe(0);
    await photoInput.setInputFiles({
      name: "big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(main.getByRole("alert")).toHaveText(
      "사진은 5MB 이하로 골라 주세요.",
    );
    await main.getByRole("button", { name: "저장하기", exact: true }).click();
    await expect(main.getByRole("alert")).toHaveText(
      "사진은 5MB 이하로 골라 주세요.",
    );
    expect(patchRequests).toBe(0);
  });

  await test.step("일기가 있는 반려견은 삭제하지 못한다", async () => {
    await menu.getByRole("link", { name: "내 반려견", exact: true }).click();
    await expect(page).toHaveURL("/dogs");
    const card = main.getByRole("article").filter({
      has: page.getByRole("heading", { name: "두부", exact: true }),
    });
    page.once("dialog", (dialog) => dialog.accept());
    await card.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(main.getByRole("alert")).toHaveText(
      "일기를 먼저 삭제해 주세요.",
    );
    await expect(card).toBeVisible();
  });

  await test.step("일기를 삭제하면 목록에서 사라진다", async () => {
    await menu.getByRole("link", { name: "산책 일기", exact: true }).click();
    await expect(page).toHaveURL("/diaries");
    await main.getByRole("article").getByRole("link").click();
    await expect(page).toHaveURL(/\/diaries\/\d+$/);
    page.once("dialog", (dialog) => dialog.accept());
    await main.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(page).toHaveURL("/diaries");
    await expect(main.getByText("아직 일기가 없어요.")).toBeVisible();
    await expect(main.getByRole("article")).toHaveCount(0);
  });
});

test("목록 조회가 실패해도 수정 저장 응답으로 상세에 바로 이동한다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  const created = await request.post("/api/diaries", {
    headers: account.headers,
    multipart: {
      diary: JSON.stringify({
        dogId: account.dogId,
        title: "처음 산책 제목",
        walkedOn: "2020-10-21",
        content: "처음 쓴 일기",
      }),
    },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id as number;
  const main = page.getByRole("main");
  await login(page, account);
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "산책 일기", exact: true })
    .click();
  await expect(page).toHaveURL("/diaries");
  await main.getByRole("article").getByRole("link").click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  await main.getByRole("link", { name: "수정", exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+\/edit$/);
  await expect(main.getByRole("textbox", { name: /^일기 내용/ })).toHaveValue(
    "처음 쓴 일기",
  );

  await page.route("**/api/diaries?*", (route) =>
    route.fulfill({ status: 500, json: { message: "일기 목록 조회 실패" } }),
  );
  await main
    .getByRole("textbox", { name: "제목", exact: true })
    .fill("저장 응답의 새 제목");
  let detailReads = 0;
  await page.route(`**/api/diaries/${id}`, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    detailReads++;
    return route.fulfill({
      status: 500,
      json: { message: "상세를 다시 읽으면 안 돼요." },
    });
  });
  await main
    .getByRole("textbox", { name: /^일기 내용/ })
    .fill("저장 응답으로 보여 주는 새 일기");
  await main.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page).toHaveURL(`/diaries/${id}`);
  await expect(
    main.getByText("저장 응답으로 보여 주는 새 일기", { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "저장 응답의 새 제목" }),
  ).toBeVisible();
  expect(detailReads).toBe(0);

  const failedList = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/diaries" &&
      response.status() === 500,
  );
  await main.getByRole("link", { name: "일기 목록", exact: true }).click();
  await expect(page).toHaveURL("/diaries");
  await failedList;
  await expect(main.getByRole("alert")).toHaveText("일기 목록 조회 실패");
});

test("일기 수정은 첫 진입과 재진입 모두 새 조회를 기다리고 실패하면 폼을 숨긴다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  const body = {
    dogId: account.dogId,
    title: "처음 산책 제목",
    walkedOn: "2020-10-21",
    content: "처음 쓴 일기",
  };
  const created = await request.post("/api/diaries", {
    headers: account.headers,
    multipart: { diary: JSON.stringify(body) },
  });
  expect(created.status()).toBe(201);
  const id = (await created.json()).id as number;
  const main = page.getByRole("main");
  await login(page, account);
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "산책 일기", exact: true })
    .click();
  await expect(page).toHaveURL("/diaries");
  await main.getByRole("article").getByRole("link").click();
  await expect(page).toHaveURL(/\/diaries\/\d+$/);
  await expect(main.getByText(body.content, { exact: true })).toBeVisible();

  for (const content of [
    "서버에서 바꾼 첫 번째 글",
    "서버에서 바꾼 두 번째 글",
  ]) {
    expect(
      (
        await request.patch(`/api/diaries/${id}`, {
          headers: account.headers,
          multipart: { diary: JSON.stringify({ ...body, content }) },
        })
      ).status(),
    ).toBe(200);
    const captured = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const completed = Promise.withResolvers<void>();
    await page.route(`**/api/diaries/${id}`, async (route) => {
      const response = await route.fetch();
      captured.resolve();
      await release.promise;
      await route.fulfill({ response });
      completed.resolve();
    });
    await main.getByRole("link", { name: "수정", exact: true }).click();
    await expect(page).toHaveURL(/\/diaries\/\d+\/edit$/);
    await captured.promise;
    try {
      await expect(main.getByRole("status")).toHaveText(
        "일기를 불러오고 있어요.",
      );
      await expect(main.getByRole("textbox", { name: /^일기 내용/ })).toHaveCount(0);
    } finally {
      release.resolve();
    }
    await completed.promise;
    await expect(main.getByRole("textbox", { name: /^일기 내용/ })).toHaveValue(
      content,
    );
    await page.unroute(`**/api/diaries/${id}`);
    await main.getByRole("link", { name: "일기 목록", exact: true }).click();
    await expect(page).toHaveURL("/diaries");
    await main.getByRole("article").getByRole("link").click();
    await expect(page).toHaveURL(/\/diaries\/\d+$/);
  }

  await page.route(`**/api/diaries/${id}`, (route) =>
    route.fulfill({ status: 500, json: { message: "일기 수정 조회 실패" } }),
  );
  await main.getByRole("link", { name: "수정", exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\/\d+\/edit$/);
  await expect(main.getByRole("alert")).toHaveText("일기 수정 조회 실패");
  await expect(main.getByRole("textbox", { name: /^일기 내용/ })).toHaveCount(0);
  await expect(main.locator("form")).toHaveCount(0);
});

test("일기 7개를 두 쪽으로 보고 빈 쪽에서 돌아오며 반려견을 바꾸면 1쪽으로 간다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  for (let index = 1; index <= 7; index++) {
    const created = await request.post("/api/diaries", {
      headers: account.headers,
      multipart: {
        diary: JSON.stringify({
          dogId: account.dogId,
          title: `산책 제목 ${index}`,
          walkedOn: "2020-10-21",
          content: `산책 기록 ${index}`,
        }),
      },
    });
    expect(created.status()).toBe(201);
  }
  await login(page, account);
  await page.goto("/diaries?page=1");
  const main = page.getByRole("main");
  const pagination = main.getByRole("navigation", { name: "산책 일기 페이지" });
  await expect(main.getByRole("article").getByRole("heading")).toHaveText([
    "산책 제목 7",
    "산책 제목 6",
    "산책 제목 5",
    "산책 제목 4",
    "산책 제목 3",
    "산책 제목 2",
  ]);
  await expect(pagination.getByRole("link", { name: "이전" })).toHaveCount(0);
  await pagination.getByRole("link", { name: "다음" }).click();
  await expect(page).toHaveURL("/diaries?page=2");
  await expect(main.getByRole("article").getByRole("heading")).toHaveText([
    "산책 제목 1",
  ]);
  await expect(pagination.getByRole("link", { name: "다음" })).toHaveCount(0);
  await pagination.getByRole("link", { name: "이전" }).click();
  await expect(page).toHaveURL("/diaries?page=1");
  await expect(main.getByRole("article")).toHaveCount(6);

  await page.goto(`/diaries?page=3&dogId=${account.dogId}`);
  await expect(main.getByText("이 페이지에는 일기가 없어요.")).toBeVisible();
  await expect(main.getByRole("article")).toHaveCount(0);
  await main.getByRole("link", { name: "마지막 페이지로" }).click();
  await expect(page).toHaveURL(`/diaries?page=2&dogId=${account.dogId}`);
  await expect(main.getByRole("article")).toHaveCount(1);
  const filters = main.getByRole("group", { name: "반려견 고르기" });
  await expect(
    filters.getByRole("button", { name: "두부", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "보리", exact: true }).click();
  await expect(page).toHaveURL(/\/diaries\?page=1&dogId=\d+$/);
  await expect(main.getByText("아직 일기가 없어요.")).toBeVisible();
  await filters.getByRole("button", { name: "전체", exact: true }).click();
  await expect(page).toHaveURL("/diaries?page=1");
  await expect(main.getByRole("article")).toHaveCount(6);
});
