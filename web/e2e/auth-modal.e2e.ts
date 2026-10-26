import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

const newAccount = () => {
  const id = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  return {
    email: `modal-${id}@example.com`,
    nickname: `모달${id}`,
    password: randomUUID().slice(0, 20),
  };
};

const createAccount = async (request: APIRequestContext) => {
  const account = newAccount();
  const response = await request.post("/api/auth/signup", {
    data: {
      ...account,
      dog: {
        name: "모달두부",
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

const submitLogin = async (
  form: Locator,
  account: ReturnType<typeof newAccount>,
) => {
  await form.getByLabel("이메일").fill(account.email);
  await form.getByLabel("비밀번호").fill(account.password);
  await form.getByRole("button", { name: "로그인", exact: true }).click();
};

const fillSignup = async (
  form: Locator,
  account: ReturnType<typeof newAccount>,
) => {
  await form.getByLabel("이메일").fill(account.email);
  await form.getByLabel("비밀번호 (8~20자)").fill(account.password);
  await form.getByLabel("닉네임").fill(account.nickname);
  await form.getByLabel("이름", { exact: true }).fill("모달두부");
  await form.getByLabel("견종").fill("푸들");
  await form.getByRole("radio", { name: "소형", exact: true }).check();
  await form.getByRole("radio", { name: "암컷", exact: true }).check();
  await form.getByLabel("태어난 해").selectOption("2022");
  await form.getByLabel("성격 소개").fill("함께 걸어요.");
};

const openLogin = async (page: Page, path = "/dogs") => {
  await page.goto(path);
  await page
    .getByRole("banner")
    .getByRole("link", {
      name: "로그인",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", { name: "로그인", exact: true });
  await expect(page).toHaveURL("/login");
  await expect(dialog).toBeVisible();
  return dialog;
};

// Fetch a successful response now and deliver it after the user leaves.
const holdAuthResponse = async (page: Page, action: "login" | "signup") => {
  const path = `**/api/auth/${action}`;
  let capture!: (value: { route: Route; response: APIResponse }) => void;
  const captured = new Promise<{ route: Route; response: APIResponse }>(
    (resolve) => {
      capture = resolve;
    },
  );
  await page.route(
    path,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(action === "login" ? 200 : 201);
      capture({ route, response });
    },
    { times: 1 },
  );
  return {
    captured,
    release: async () => {
      const { route, response } = await captured;
      const received = page.waitForResponse(path);
      await route.fulfill({ response });
      await (await received).finished();
      // Let the submit continuation and React's resulting render finish.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          }),
      );
    },
  };
};

for (const entry of ["머리 메뉴", "본문"]) {
  test(`${entry} 로그인은 원래 반려견 화면으로 돌아오고 앞으로 가도 모달이 없다`, async ({
    page,
    request,
  }) => {
    const account = await createAccount(request);
    await page.goto("/dogs");
    await page
      .getByRole(entry === "머리 메뉴" ? "banner" : "main")
      .getByRole("link", { name: "로그인", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "로그인", exact: true });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL("/login");
    await submitLogin(dialog, account);
    await expect(page).toHaveURL("/dogs");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("heading", {
        name: "모달두부",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("banner")).toContainText(account.nickname);

    await page.goForward();
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("heading", {
        name: "모달두부",
        exact: true,
      }),
    ).toBeVisible();
  });
}

for (const method of ["닫기", "Esc", "뒤 막", "뒤로 가기"]) {
  test(`${method}로 모달을 닫으면 원래 주소로 돌아온다`, async ({ page }) => {
    const dialog = await openLogin(page);
    if (method === "닫기")
      await dialog.getByRole("button", { name: "닫기" }).click();
    if (method === "Esc") await page.keyboard.press("Escape");
    if (method === "뒤 막") await page.mouse.click(2, 2);
    if (method === "뒤로 가기") await page.goBack();
    await expect(page).toHaveURL("/dogs");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("link", {
        name: "로그인",
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("모달 전환은 기록을 추가하지 않고 홈으로 이동하면 모달이 사라진다", async ({
  page,
}) => {
  const login = await openLogin(page);
  await login.getByRole("link", { name: "회원가입", exact: true }).click();
  const signup = page.getByRole("dialog", { name: "회원가입", exact: true });
  await expect(page).toHaveURL("/signup");
  await expect(signup).toBeVisible();
  await signup.getByRole("link", { name: "로그인", exact: true }).click();
  await expect(login).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("/dogs");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goForward();
  await expect(login).toBeVisible();
  await login.getByRole("link", { name: "홈으로", exact: true }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const kind of ["login", "signup"] as const) {
  test(`${kind} 모달을 새로고침하면 전체 페이지가 된다`, async ({ page }) => {
    const login = await openLogin(page);
    if (kind === "signup") {
      await login.getByRole("link", { name: "회원가입", exact: true }).click();
    }
    const title = kind === "login" ? "로그인" : "회원가입";
    await expect(
      page.getByRole("dialog", { name: title, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(`/${kind}`);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("heading", {
        name: title,
        exact: true,
      }),
    ).toBeVisible();
  });
}

test("전체 로그인 페이지에서 성공하면 홈으로 간다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  await page.goto("/login");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await submitLogin(page.getByRole("main"), account);
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("banner")).toContainText(account.nickname);
});

for (const modal of [false, true]) {
  test(`${modal ? "모달" : "전체 페이지"} 가입 성공 후 같은 형식의 로그인 폼이 열린다`, async ({
    page,
  }) => {
    const account = newAccount();
    if (modal) {
      const login = await openLogin(page);
      await login.getByRole("link", { name: "회원가입", exact: true }).click();
      // Fill only after the signup form replaces the login form.
      await expect(page).toHaveURL("/signup");
      await expect(
        page.getByRole("dialog", { name: "회원가입", exact: true }),
      ).toBeVisible();
    } else {
      await page.goto("/signup");
    }
    const form = page.getByRole(modal ? "dialog" : "main");
    await fillSignup(form, account);
    await form.getByRole("button", { name: "가입하기", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await expect(
      form.getByRole("heading", { name: "로그인", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(modal ? 1 : 0);
    await submitLogin(form, account);
    await expect(page).toHaveURL(modal ? "/dogs" : "/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("banner")).toContainText(account.nickname);
  });
}

for (const leave of ["뒤로 가기", "회원가입 전환"]) {
  test(`로그인 대기 중 닫기를 막고 ${leave} 뒤 늦은 성공은 이동하지 않는다`, async ({
    page,
    request,
  }) => {
    const account = await createAccount(request);
    const dialog = await openLogin(page);
    const held = await holdAuthResponse(page, "login");
    await submitLogin(dialog, account);
    await held.captured;
    await expect(dialog.getByRole("button", { name: "닫기" })).toBeDisabled();
    // A real pointer click on the disabled button must also leave it open.
    const close = await dialog
      .getByRole("button", { name: "닫기" })
      .boundingBox();
    expect(close).not.toBeNull();
    await page.mouse.click(
      close!.x + close!.width / 2,
      close!.y + close!.height / 2,
    );
    await page.keyboard.press("Escape");
    await page.mouse.click(2, 2);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL("/login");

    if (leave === "뒤로 가기") await page.goBack();
    else
      await dialog.getByRole("link", { name: "회원가입", exact: true }).click();
    const destination = leave === "뒤로 가기" ? "/dogs" : "/signup";
    await expect(page).toHaveURL(destination);
    if (leave === "회원가입 전환") {
      await expect(
        page.getByRole("dialog", { name: "회원가입", exact: true }),
      ).toBeVisible();
    }
    await held.release();
    await expect(page.getByRole("banner")).toContainText(account.nickname);
    await expect(page).toHaveURL(destination);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("main").getByRole("heading", {
        name: "모달두부",
        exact: true,
      }),
    ).toBeVisible();
    if (leave === "회원가입 전환") {
      await page.goBack();
      await expect(page).toHaveURL("/dogs");
      await page.goForward();
      await expect(page).toHaveURL("/signup");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
  });
}

for (const leave of ["뒤로 가기", "같은 주소로 돌아오기"]) {
  test(`가입 대기 중 ${leave} 뒤 옛 응답은 로그인으로 이동하지 않는다`, async ({
    page,
  }) => {
    const login = await openLogin(page);
    await login.getByRole("link", { name: "회원가입", exact: true }).click();
    const signup = page.getByRole("dialog", { name: "회원가입", exact: true });
    await fillSignup(signup, newAccount());
    const held = await holdAuthResponse(page, "signup");
    await signup.getByRole("button", { name: "가입하기", exact: true }).click();
    await held.captured;
    await expect(signup.getByRole("button", { name: "닫기" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.mouse.click(2, 2);
    await expect(signup).toBeVisible();
    if (leave === "뒤로 가기") {
      await page.goBack();
      await expect(page).toHaveURL("/dogs");
    } else {
      await signup.getByRole("link", { name: "로그인", exact: true }).click();
      await expect(login).toBeVisible();
      await login.getByRole("link", { name: "회원가입", exact: true }).click();
      await expect(page).toHaveURL("/signup");
      await expect(signup).toBeVisible();
    }
    await held.release();
    await expect(page).toHaveURL(leave === "뒤로 가기" ? "/dogs" : "/signup");
    if (leave === "뒤로 가기") {
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } else {
      await expect(
        signup.getByRole("button", { name: "가입하기", exact: true }),
      ).toBeEnabled();
      await signup.getByLabel("닉네임").fill("새 입력");
      await expect(signup.getByLabel("닉네임")).toHaveValue("새 입력");
      await signup.getByRole("button", { name: "닫기" }).click();
      await expect(page).toHaveURL("/dogs");
    }
  });
}

test("전체 가입 요청 중 연 로그인 모달과 입력은 늦은 가입 응답 뒤에도 남는다", async ({
  page,
}) => {
  await page.goto("/signup");
  const main = page.getByRole("main");
  await fillSignup(main, newAccount());
  const held = await holdAuthResponse(page, "signup");
  await main.getByRole("button", { name: "가입하기", exact: true }).click();
  await held.captured;
  await page
    .getByRole("banner")
    .getByRole("link", { name: "로그인", exact: true })
    .click();
  const login = page.getByRole("dialog", { name: "로그인", exact: true });
  await login.getByLabel("이메일").fill("keep@example.com");
  await held.release();
  await expect(page).toHaveURL("/login");
  await expect(login.getByLabel("이메일")).toHaveValue("keep@example.com");
  await login.getByRole("button", { name: "닫기" }).click();
  await expect(page).toHaveURL("/signup");
  await expect(
    main.getByRole("button", { name: "가입하기", exact: true }),
  ).toBeEnabled();
});

test("전체 로그인 요청 중 연 가입 모달은 늦은 성공 뒤 사라지고 주소는 유지된다", async ({
  page,
  request,
}) => {
  const account = await createAccount(request);
  await page.goto("/login");
  const held = await holdAuthResponse(page, "login");
  await submitLogin(page.getByRole("main"), account);
  await held.captured;
  await page
    .getByRole("banner")
    .getByRole("link", { name: "회원가입", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "회원가입", exact: true }),
  ).toBeVisible();
  await held.release();
  await expect(page.getByRole("banner")).toContainText(account.nickname);
  await expect(page).toHaveURL("/signup");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "로그인", exact: true }),
  ).toBeVisible();
});

test("가입 오류 뒤 입력과 오류를 유지하고 다시 닫을 수 있다", async ({
  page,
}) => {
  const login = await openLogin(page);
  await login.getByRole("link", { name: "회원가입", exact: true }).click();
  const signup = page.getByRole("dialog", { name: "회원가입", exact: true });
  const account = newAccount();
  await fillSignup(signup, account);
  await page.route(
    "**/api/auth/signup",
    (route) =>
      route.fulfill({
        status: 400,
        json: { message: "가입 정보를 확인해 주세요." },
      }),
    { times: 1 },
  );
  await signup.getByRole("button", { name: "가입하기", exact: true }).click();
  await expect(signup.getByRole("alert")).toHaveText(
    "가입 정보를 확인해 주세요.",
  );
  await expect(signup.getByLabel("이메일")).toHaveValue(account.email);
  await expect(
    signup.getByRole("button", { name: "가입하기", exact: true }),
  ).toBeEnabled();
  await signup.getByRole("button", { name: "닫기" }).click();
  await expect(page).toHaveURL("/dogs");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
