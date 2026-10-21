import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test.use({
  geolocation: { latitude: 37.56651, longitude: 126.97801 },
  permissions: ["geolocation"],
});

test("위치 공개 동의·갱신과 주변 반려견 조회·동의 철회", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const runId = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const password = randomUUID().slice(0, 20);
  const email = `map-a-${runId}@example.com`;
  const neighborEmail = `map-b-${runId}@example.com`;
  const nickname = `지도A${runId}`;
  const neighborNickname = `지도B${runId}`;
  const dog = {
    name: "보리",
    breed: "푸들",
    size: "SMALL",
    gender: "FEMALE",
    neutered: true,
    birthYear: 2021,
    personality: "친구와 산책을 좋아해요.",
  };
  const main = page.getByRole("main");
  let neighborAuthorization: string | undefined;

  try {
    await test.step("두 계정을 만들고 주변 사용자의 위치를 준비한다", async () => {
      const signup = await request.post("/api/auth/signup", {
        data: { email, password, nickname, dog },
      });
      expect(signup.status()).toBe(201);
      const neighborSignup = await request.post("/api/auth/signup", {
        data: {
          email: neighborEmail,
          password,
          nickname: neighborNickname,
          dog: { ...dog, name: "주변두부" },
        },
      });
      expect(neighborSignup.status()).toBe(201);
      const login = await request.post("/api/auth/login", {
        data: { email: neighborEmail, password },
      });
      expect(login.status()).toBe(200);
      neighborAuthorization = `Bearer ${(await login.json()).accessToken}`;
      const headers = { Authorization: neighborAuthorization };
      expect(
        (
          await request.post("/api/users/me/location-consent", { headers })
        ).status(),
      ).toBe(204);
      expect(
        (
          await request.patch("/api/users/me/location", {
            headers,
            data: { lat: 37.57, lng: 126.978 },
          })
        ).status(),
      ).toBe(200);
    });

    await test.step("로그인 후 홈의 지도 링크로 들어가 동의한다", async () => {
      await page.goto("/login");
      await main.getByLabel("이메일").fill(email);
      await main.getByLabel("비밀번호").fill(password);
      await main.getByRole("button", { name: "로그인", exact: true }).click();
      await expect(page).toHaveURL("/");
      await expect(main.getByText(`${nickname}님, 안녕하세요`)).toBeVisible();
      await main.getByRole("link", { name: "지도", exact: true }).click();
      await expect(page).toHaveURL("/map");
      await expect(
        main.getByText(
          "내 위치를 약 200m 단위로 흐려서 저장하고, 7일 동안 주변 사용자에게 보여 줘요. 저장된 위치는 공개를 끌 때까지 보관되고, 언제든 끌 수 있어요.",
        ),
      ).toBeVisible();
      await main
        .getByRole("button", { name: "동의하고 위치 공개", exact: true })
        .click();
      await expect(
        main.getByRole("button", { name: "내 위치 갱신", exact: true }),
      ).toBeVisible();
    });

    await test.step("위치를 갱신하고 주변 사용자 목록에서 반려견을 확인한다", async () => {
      await main
        .getByRole("button", { name: "내 위치 갱신", exact: true })
        .click();
      const neighbors = main.getByRole("region", {
        name: "주변 산책 친구",
        exact: true,
      });
      const neighbor = neighbors
        .getByRole("button")
        .filter({ hasText: neighborNickname });
      await expect(neighbor).toBeVisible();
      await neighbor.click();
      const details = main.getByRole("region", {
        name: `${neighborNickname}의 반려견`,
        exact: true,
      });
      await expect(
        details.getByRole("heading", { name: "주변두부", exact: true }),
      ).toBeVisible();
      await expect(
        details.getByText("푸들 · 소형 · 암컷", { exact: true }),
      ).toBeVisible();
      await expect(
        details.getByText("중성화했어요 · 2021년생", { exact: true }),
      ).toBeVisible();
    });

    await test.step("동의를 철회하면 다시 동의 안내를 보여 준다", async () => {
      page.once("dialog", (dialog) => dialog.accept());
      await main
        .getByRole("button", { name: "위치 공개 끄기", exact: true })
        .click();
      await expect(
        main.getByRole("button", { name: "동의하고 위치 공개", exact: true }),
      ).toBeVisible();
      await expect(
        main.getByRole("region", { name: "주변 산책 친구", exact: true }),
      ).toHaveCount(0);
    });
  } finally {
    if (neighborAuthorization) {
      const response = await request.delete("/api/users/me/location-consent", {
        headers: { Authorization: neighborAuthorization },
      });
      expect(response.status()).toBe(204);
    }
  }
});
