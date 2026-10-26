import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    demoGeolocationCalls: number;
  }
}

test.use({ permissions: [] });

test("가입 없이 둘러보고 데모 계정의 화면 제한을 확인한다", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const main = page.getByRole("main");
  const header = page.getByRole("banner");
  const locationRequests: string[] = [];
  await page.clock.install();
  await page.addInitScript(() => {
    window.demoGeolocationCalls = 0;
    // Count even a denied lookup: watching PATCH alone misses that case.
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
      configurable: true,
      value: (_success: PositionCallback, error?: PositionErrorCallback) => {
        window.demoGeolocationCalls += 1;
        error?.({
          code: 1,
          message: "Location permission denied",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      },
    });
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      (path === "/api/users/me/location" && request.method() === "PATCH") ||
      path === "/api/users/me/location-consent"
    ) {
      locationRequests.push(`${request.method()} ${path}`);
    }
  });

  try {
    await test.step("손님 홈 카드에서 둘러보기를 시작한다", async () => {
      await page.goto("/");
      await main.getByRole("button", { name: "가입 없이 둘러보기" }).click();
      await expect(main.getByText("둘러보기님, 안녕하세요")).toBeVisible();
      await expect(header.getByText("체험 중", { exact: true })).toBeVisible();
    });

    await test.step("저장된 위치로 지도를 보고 위치 조회와 전송은 하지 않는다", async () => {
      await header
        .getByRole("link", { name: "주변 친구", exact: true })
        .click();
      await expect(page).toHaveURL("/map");
      const neighbors = main.getByRole("region", {
        name: "주변 산책 친구",
        exact: true,
      });
      for (const nickname of [
        "강바람산책",
        "노을발자국",
        "풀잎쉼표",
        "물결따라",
        "아침둔치",
      ]) {
        await expect(
          neighbors.getByRole("button").filter({ hasText: nickname }),
        ).toBeVisible();
      }
      await expect(
        main.getByText("위치 공개 중", { exact: true }),
      ).toBeVisible();
      await expect(
        main.getByRole("button", { name: "위치 공개 끄기" }),
      ).toHaveCount(0);
      // Both alternatives belong to KakaoMap, so the waiting drawing fails.
      await expect(
        main
          .getByLabel("내 위치와 주변 사용자 지도", { exact: true })
          .or(main.getByText("지도를 불러오지 못했어요.", { exact: true })),
      ).toBeVisible();
      await expect(main.getByText("지도를 준비하고 있어요.")).toHaveCount(0);
      expect(
        await page.evaluate(() => window.demoGeolocationCalls),
      ).toBe(0);
      expect(locationRequests).toEqual([]);

      const refreshed = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/users/nearby" &&
          response.request().method() === "GET",
      );
      await page.clock.fastForward(61_000);
      expect((await refreshed).ok()).toBe(true);
      expect(
        await page.evaluate(() => window.demoGeolocationCalls),
      ).toBe(0);
      expect(locationRequests).toEqual([]);
    });

    await test.step("내 정보에는 변경 폼 대신 안내가 보인다", async () => {
      await header.getByRole("link", { name: "내 정보", exact: true }).click();
      await expect(page).toHaveURL("/me");
      await expect(
        main.getByText("데모 계정에서는 닉네임과 비밀번호를 바꿀 수 없어요."),
      ).toBeVisible();
      await expect(
        main.getByText("닉네임과 비밀번호를 바꿀 수 있어요."),
      ).toHaveCount(0);
      await expect(main.getByLabel("닉네임", { exact: true })).toHaveCount(0);
      await expect(main.getByLabel(/비밀번호/)).toHaveCount(0);
    });

    await test.step("강아지 수정과 등록에서 사진 입력을 숨긴다", async () => {
      await header
        .getByRole("link", { name: "내 반려견", exact: true })
        .click();
      await expect(page).toHaveURL("/dogs");
      await main
        .getByRole("link", { name: "수정", exact: true })
        .first()
        .click();
      await expect(page).toHaveURL(/\/dogs\/\d+\/edit$/);
      await expect(
        main.getByText("데모 계정은 사진을 올릴 수 없어요."),
      ).toBeVisible();
      await expect(main.locator('input[type="file"]')).toHaveCount(0);
      await expect(
        main.getByRole("button", { name: "저장하기" }),
      ).toBeEnabled();

      await header
        .getByRole("link", { name: "내 반려견", exact: true })
        .click();
      await expect(page).toHaveURL("/dogs");
      await main
        .getByRole("link", { name: "반려견 추가", exact: true })
        .click();
      await expect(page).toHaveURL("/dogs/new");
      await expect(
        main.getByText("데모 계정은 사진을 올릴 수 없어요."),
      ).toBeVisible();
      await expect(main.locator('input[type="file"]')).toHaveCount(0);
    });

    await test.step("일기 쓰기에서 사진 입력을 숨긴다", async () => {
      await header
        .getByRole("link", { name: "산책 일기", exact: true })
        .click();
      await expect(page).toHaveURL("/diaries");
      await main.getByRole("link", { name: "일기 쓰기", exact: true }).click();
      await expect(page).toHaveURL("/diaries/new");
      await expect(
        main.getByText("데모 계정은 사진을 올릴 수 없어요."),
      ).toBeVisible();
      await expect(main.locator('input[type="file"]')).toHaveCount(0);
      await expect(
        main.getByRole("button", { name: "저장하기" }),
      ).toBeEnabled();
    });
  } finally {
    const logout = header.getByRole("button", {
      name: "로그아웃",
      exact: true,
    });
    if (await logout.isVisible()) {
      await logout.click();
      await expect(logout).toHaveCount(0);
    }
  }

  await test.step("로그인 페이지에도 둘러보기 버튼이 있다", async () => {
    await page.goto("/login");
    await expect(
      main.getByRole("button", { name: "가입 없이 둘러보기" }),
    ).toBeEnabled();
  });
});

test("데모 로그인 중 두 버튼을 막고 실패 문구를 그대로 보여 준다", async ({
  page,
}) => {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/auth/demo", async (route) => {
    await released;
    await route.fulfill({
      status: 503,
      json: { message: "데모 계정을 준비하고 있어요…" },
    });
  });
  await page.goto("/login");
  const main = page.getByRole("main");
  const demo = main.getByRole("button", { name: "가입 없이 둘러보기" });
  try {
    await demo.click();
    await expect(demo).toBeDisabled();
    await expect(
      main.getByRole("button", { name: "로그인 중…" }),
    ).toBeDisabled();
  } finally {
    release();
  }
  await expect(main.getByRole("alert")).toHaveText(
    "데모 계정을 준비하고 있어요…",
  );
  await expect(demo).toBeEnabled();
  await expect(
    main.getByRole("button", { name: "로그인", exact: true }),
  ).toBeEnabled();
});
