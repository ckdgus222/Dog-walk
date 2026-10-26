import { randomUUID } from "node:crypto";
import {
  errors,
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

// Two 2x2 PNGs in different colors, kept inline so no image files are committed.
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

const firstDog = {
  name: "보리",
  breed: "푸들",
  // Not the first option of each group, so a form that always checks the
  // first radio fails the saved-value check below.
  size: "MEDIUM",
  gender: "FEMALE",
  neutered: true,
  birthYear: 2021,
  personality: "친구와 걷는 걸 좋아해요.",
};

const createAccount = async (request: APIRequestContext) => {
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const account = {
    email: `browser-${runId}@example.com`,
    nickname: `산책${runId}`,
    password: randomUUID().slice(0, 20),
  };
  const signup = await request.post("/api/auth/signup", {
    data: { ...account, dog: firstDog },
  });
  expect(signup.status()).toBe(201);
  return account;
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

test("반려견 사진 추가·교체와 마지막 한 마리 삭제 제한", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const cards = page.getByRole("article");
  const firstCard = cards.filter({
    has: page.getByRole("heading", { name: firstDog.name, exact: true }),
  });
  const secondCard = cards.filter({
    has: page.getByRole("heading", { name: "두부", exact: true }),
  });
  // Search only the visible <main>. Next.js keeps recently visited pages in the
  // DOM as hidden copies, and adds its own role="alert" route announcer, so
  // page-wide label or alert lookups can hit elements the user cannot see.
  const main = page.getByRole("main");
  const photoInput = main.getByLabel("사진 (선택, 5MB 이하)");
  const alert = main.getByRole("alert");

  const account = await test.step("준비: 새 계정과 반려견 한 마리를 등록한다", () =>
    createAccount(request),
  );

  await test.step("로그인하고 가입 때 등록한 반려견을 확인한다", async () => {
    await login(page, account);
    await expect(main.getByText(`${account.nickname}님, 안녕하세요`)).toBeVisible();
    await main.getByRole("link", { name: "내 반려견", exact: true }).click();
    await expect(page).toHaveURL("/dogs");
    await expect(cards).toHaveCount(1);
    await expect(
      firstCard.getByRole("img", { name: "사진 없음", exact: true }),
    ).toBeVisible();
  });

  await test.step("기존 입력값을 확인하고 사진 A를 추가한다", async () => {
    await firstCard.getByRole("link", { name: "수정", exact: true }).click();
    await expect(main.getByLabel("이름", { exact: true })).toHaveValue(
      firstDog.name,
    );
    await expect(main.getByLabel("견종")).toHaveValue(firstDog.breed);
    await expect(
      main.getByRole("radio", { name: "중형", exact: true }),
    ).toBeChecked();
    await expect(
      main.getByRole("radio", { name: "암컷", exact: true }),
    ).toBeChecked();
    await expect(main.getByLabel("중성화했어요")).toBeChecked();
    await expect(main.getByLabel("태어난 해")).toHaveValue(
      String(firstDog.birthYear),
    );
    await expect(main.getByLabel("성격 소개")).toHaveValue(
      firstDog.personality,
    );
    // The picked photo shows in place of the drawn dog, and cancelling
    // brings the drawing back.
    const preview = main.getByRole("img", {
      name: "고른 사진 미리보기",
      exact: true,
    });
    await photoInput.setInputFiles(photoA);
    await expect(preview).toBeVisible();
    await expect
      .poll(() =>
        preview.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await main.getByRole("button", { name: "선택 취소", exact: true }).click();
    await expect(preview).toHaveCount(0);
    await photoInput.setInputFiles(photoA);
    await expect(preview).toBeVisible();
    await page.getByRole("button", { name: "저장하기", exact: true }).click();
    await expect(page).toHaveURL("/dogs");
    await expect(cards).toHaveCount(1);
    const photo = firstCard.getByRole("img", {
      name: "보리 사진",
      exact: true,
    });
    await expect(photo).toHaveAttribute(
      "src",
      /^\/uploads\/dogs\/[^/]+\.webp$/,
    );
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
  });

  await test.step("필수 칸을 채워도 5MB 초과 사진은 저장 요청을 보내지 않는다", async () => {
    await page.getByRole("link", { name: "반려견 추가", exact: true }).click();
    await expect(page).toHaveURL("/dogs/new");
    await main.getByLabel("이름", { exact: true }).fill("두부");
    await main.getByLabel("견종").fill("진돗개");
    await main.getByRole("radio", { name: "중형", exact: true }).check();
    await main.getByRole("radio", { name: "암컷", exact: true }).check();
    await main.getByLabel("중성화했어요").check();
    await main.getByLabel("태어난 해").selectOption({ label: "2022년" });
    await main.getByLabel("성격 소개").fill("천천히 냄새 맡는 걸 좋아해요.");
    await photoInput.setInputFiles({
      name: "big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
    await expect(alert).toHaveText(
      "사진은 5MB 이하로 골라 주세요.",
    );
    const saveButton = page.getByRole("button", {
      name: "저장하기",
      exact: true,
    });
    await expect(saveButton).toBeEnabled();
    // Watch for a full second instead of assuming no request right after the click.
    const createRequestSent = page
      .waitForRequest(
        (request) =>
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/dogs",
        { timeout: 1_000 },
      )
      .then(
        () => true,
        (error: unknown) => {
          if (error instanceof errors.TimeoutError) return false;
          throw error;
        },
      );
    await saveButton.click();
    expect(await createRequestSent).toBe(false);
    await expect(page).toHaveURL("/dogs/new");
    await expect(alert).toHaveText(
      "사진은 5MB 이하로 골라 주세요.",
    );
  });

  let previousPhotoUrl = "";
  await test.step("입력값을 유지하고 사진 B로 바꿔 새 반려견을 등록한다", async () => {
    await photoInput.setInputFiles(photoB);
    await expect(alert).toHaveCount(0);
    await page.getByRole("button", { name: "저장하기", exact: true }).click();
    await expect(page).toHaveURL("/dogs");
    await expect(cards).toHaveCount(2);
    await expect(
      secondCard.getByText("진돗개 · 중형 · 암컷 · 중성화 · 2022년생", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      secondCard.getByText("천천히 냄새 맡는 걸 좋아해요.", { exact: true }),
    ).toBeVisible();
    const photo = secondCard.getByRole("img", {
      name: "두부 사진",
      exact: true,
    });
    await expect(photo).toHaveAttribute(
      "src",
      /^\/uploads\/dogs\/[^/]+\.webp$/,
    );
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    previousPhotoUrl = (await photo.getAttribute("src"))!;
  });

  await test.step("사진 A로 교체하면 새 사진이 보이고 이전 파일은 삭제된다", async () => {
    await secondCard.getByRole("link", { name: "수정", exact: true }).click();
    await photoInput.setInputFiles(photoA);
    await page.getByRole("button", { name: "저장하기", exact: true }).click();
    await expect(page).toHaveURL("/dogs");
    await expect(cards).toHaveCount(2);
    const photo = secondCard.getByRole("img", {
      name: "두부 사진",
      exact: true,
    });
    await expect(photo).toHaveAttribute(
      "src",
      /^\/uploads\/dogs\/[^/]+\.webp$/,
    );
    await expect(photo).not.toHaveAttribute("src", previousPhotoUrl);
    await expect
      .poll(() =>
        photo.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    const previousPhoto = await request.get(previousPhotoUrl);
    expect(previousPhoto.status()).toBe(404);
  });

  await test.step("새 반려견을 삭제하면 처음 반려견만 남는다", async () => {
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });
    await secondCard.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(firstCard).toBeVisible();
    await expect(secondCard).toHaveCount(0);
  });

  await test.step("마지막 반려견은 삭제되지 않고 안내 문구가 보인다", async () => {
    page.once("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      await dialog.accept();
    });
    await firstCard.getByRole("button", { name: "삭제", exact: true }).click();
    await expect(alert).toHaveText(
      "반려견은 최소 한 마리 있어야 해요.",
    );
    await expect(cards).toHaveCount(1);
    await expect(firstCard).toBeVisible();
  });
});

test("반려견 등록 뒤 다시 추가하면 입력과 사진 미리보기를 비운다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  const main = page.getByRole("main");
  await login(page, account);
  await page.goto("/dogs/new");
  await main.getByLabel("이름", { exact: true }).fill("두부");
  await main.getByLabel("견종").fill("진돗개");
  await main.getByRole("radio", { name: "중형", exact: true }).check();
  await main.getByRole("radio", { name: "암컷", exact: true }).check();
  await main.getByLabel("중성화했어요").check();
  await main.getByLabel("태어난 해").selectOption("2022");
  await main.getByLabel("성격 소개").fill("천천히 걷는 걸 좋아해요.");
  await main.getByLabel("사진 (선택, 5MB 이하)").setInputFiles(photoA);
  await expect(
    main.getByRole("img", { name: "고른 사진 미리보기" }),
  ).toBeVisible();
  await main.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page).toHaveURL("/dogs");
  await expect(
    main.getByRole("heading", { name: "두부", exact: true }),
  ).toBeVisible();
  await main.getByRole("link", { name: "반려견 추가", exact: true }).click();
  await expect(page).toHaveURL("/dogs/new");
  await expect(main.getByLabel("이름", { exact: true })).toHaveValue("");
  await expect(main.getByLabel("견종")).toHaveValue("");
  await expect(main.getByLabel("성격 소개")).toHaveValue("");
  await expect(main.getByRole("radio", { checked: true })).toHaveCount(0);
  await expect(main.getByLabel("중성화했어요")).not.toBeChecked();
  await expect(main.getByLabel("태어난 해")).toHaveValue("");
  await expect(main.locator('[data-count="0/20"]')).toHaveCount(1);
  await expect(main.locator('[data-count="0/30"]')).toHaveCount(1);
  await expect(main.locator('[data-count="0/100"]')).toHaveCount(1);
  await expect(
    main.getByRole("img", { name: "고른 사진 미리보기" }),
  ).toHaveCount(0);
});
