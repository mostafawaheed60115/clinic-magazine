import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { messages } from "../src/i18n.js";

async function english(page) {
  await page.goto("/");
  await page.locator("#locale-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}
async function login(page) {
  await page.evaluate(async () => {
    const auth = await import("/src/auth.js");
    await auth.signIn("admin", "clinic");
  });
  await page.goto("/#/admin");
  await expect(page.locator("h1")).toHaveText("Overview");
}
async function addBrand(page, name = "Test brand") {
  await page.goto("/#/admin/companies/new");
  await page.locator("#field-name_ar").fill("علامة للاختبار");
  await page.locator("#field-name_en").fill(name);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/#\/admin\/companies$/);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("clinic-demo-session")) {
      localStorage.setItem(
        "clinic-demo-session",
        JSON.stringify({ id: "demo-user" }),
      );
    }
  });
});

test("localization dictionaries have complete parity", () => {
  expect(Object.keys(messages.ar).sort()).toEqual(
    Object.keys(messages.en).sort(),
  );
});

test("admin creates an event and a signed-in buyer registers once", async ({
  page,
}) => {
  await english(page);
  await login(page);
  await page.goto("/#/admin/events");
  const today = await page.evaluate(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  await page.locator('#event-editor [name="name"]').fill("Clinic day");
  await page
    .locator('#event-editor [name="description"]')
    .fill("Meet the Clinic team.");
  await page.locator('#event-editor [name="start_date"]').fill(today);
  await page.locator('#event-editor [name="end_date"]').fill(today);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Clinic day" })).toBeVisible();
  await page.evaluate(async () => {
    const auth = await import("/src/auth.js");
    await auth.signOut();
    await auth.signIn("demo", "clinic");
  });
  await page.goto("/#/events");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("link", { name: "Events" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "work/mobile-events-en.png", fullPage: true });
  await page.locator('[data-event-id] [name="name"]').fill("Buyer One");
  await page.locator('[data-event-id] [name="phone"]').fill("01011111111");
  await page.getByRole("button", { name: "Confirm participation" }).click();
  await expect(page.getByText("You are registered")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You are registered")).toBeVisible();
});

test("brand tiles keep the localized name visible beside the mark", async ({
  page,
}) => {
  await page.goto("/#/brands");
  const firstBrand = page.locator('a[href^="#/brand/"]').first();
  await expect(firstBrand.locator("strong")).toBeVisible();
  await expect(firstBrand.locator("strong")).not.toHaveText("");
});

test("exclusive brands, product table and consultation settings work together", async ({
  page,
}) => {
  await english(page);
  await page.goto("/#/brand/luma");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveCount(5);
  await expect(page.locator("main table tbody tr")).toHaveCount(8);
  expect(
    await page
      .locator("main table img")
      .first()
      .evaluate((img) => getComputedStyle(img).objectFit),
  ).toBe("contain");
  expect(
    await page.evaluate(() => getComputedStyle(document.body).backgroundColor),
  ).toBe("rgb(252, 247, 252)");
  const initialConsultation = page.getByRole("link", {
    name: "Ask for medical consultant",
  });
  await expect(initialConsultation).toHaveAttribute(
    "href",
    /wa\.me\/201062270083\?text=/,
  );

  await login(page);
  await page.goto("/#/admin/companies?q=LUMA");
  await page.getByRole("link", { name: "Edit: LUMA" }).click();
  await page.locator("#field-is-exclusive").check();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/#\/admin\/companies$/);
  await page.goto("/#/exclusive");
  await expect(page.locator('main a[href="#/brand/luma"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Exclusive brands" }),
  ).toBeVisible();

  await page.goto("/#/admin/settings");
  await page.locator("#whatsapp_phone").fill("invalid");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#whatsapp_phone")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.locator("#whatsapp_phone").fill("01011111111");
  await page.locator("#customer_service_phone").fill("01022222222");
  await page.locator("#contact_phone").fill("0881234567");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("#whatsapp_phone")).toHaveValue("+201011111111");
  await page.goto("/#/offers");
  await expect(
    page.getByRole("link", { name: "Customer Service" }),
  ).toHaveAttribute("href", "tel:+201022222222");
  await expect(page.locator('footer a[href="tel:+20881234567"]')).toBeVisible();
  const href = await page
    .getByRole("link", { name: "Ask for medical consultant" })
    .getAttribute("href");
  expect(href).toContain("wa.me/201011111111");
  expect(new URL(href).searchParams.get("text")).toBe(
    "مرحبا ...  أريد استشارة طبية من خبير ديرموكوزمتكس",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/brand/luma");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("brand discovery links lift on hover and keep their destinations on mobile", async ({
  page,
}) => {
  await english(page);
  await page.goto("/#/offers");

  const sectionLink = page.locator('main section a[href="#/brands"]');
  await expect(sectionLink).toBeVisible();
  await sectionLink.scrollIntoViewIfNeeded();
  const restingTransform = await sectionLink.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await sectionLink.hover();
  await page.waitForTimeout(250);
  const liftedTransform = await sectionLink.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  expect(liftedTransform).not.toBe(restingTransform);
  await sectionLink.click();
  await expect(page).toHaveURL(/#\/brands$/);
  await expect(page.locator("h1")).toHaveText("All brands");

  await page.goto("/#/offers");
  const desktopFooterLink = page.locator('footer a[href="#/brands"]');
  await desktopFooterLink.scrollIntoViewIfNeeded();
  const footerRestingTransform = await desktopFooterLink.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  await desktopFooterLink.hover();
  await page.waitForTimeout(250);
  const footerLiftedTransform = await desktopFooterLink.evaluate(
    (element) => getComputedStyle(element).transform,
  );
  expect(footerLiftedTransform).not.toBe(footerRestingTransform);
  await desktopFooterLink.click();
  await expect(page).toHaveURL(/#\/brands$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/offers");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const footerLink = page.locator('footer a[href="#/brands"]');
  await expect(footerLink).toHaveText("Explore brands");
  await footerLink.scrollIntoViewIfNeeded();
  const footerBox = await footerLink.boundingBox();
  expect(footerBox.x).toBeGreaterThanOrEqual(0);
  expect(footerBox.x + footerBox.width).toBeLessThanOrEqual(390);
  await footerLink.click();
  await expect(page).toHaveURL(/#\/brands$/);
  await expect(page.locator("h1")).toHaveText("All brands");

  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/offers");
  const smallScreenOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(smallScreenOverflow).toBe(false);
  const reducedMotionLink = page.locator('main section a[href="#/brands"]');
  await reducedMotionLink.hover();
  expect(
    await reducedMotionLink.evaluate(
      (element) => getComputedStyle(element).transform,
    ),
  ).toBe("none");
});

test("direct /admin entry reaches the authenticated admin panel", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("clinic-demo-session"),
  );
  await page.goto("/admin");
  await expect(page.locator("#login-form")).toBeVisible();
  await page.locator("#login-user").fill("admin");
  await page.locator("#login-pass").fill("clinic");
  await page.locator("#login-form button[type=submit]").click();
  await expect(page.locator("aside")).toBeVisible();
  await expect(page.locator("h1")).toHaveText("نظرة عامة");
});

test("admin image library is keyboard-accessible and mobile-safe", async ({
  page,
}) => {
  await english(page);
  await login(page);
  await page.goto("/#/admin/images");
  await expect(page.locator("h1")).toHaveText("Image library");
  await expect(
    page.locator('[role="button"][aria-controls="bulk-image-input"]'),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("admin brand tools and navigation remain usable on mobile", async ({
  page,
}) => {
  await english(page);
  await login(page);
  await expect(page.locator('section[aria-label="Brands"]')).toBeVisible();
  await page.waitForTimeout(500);
  await page.screenshot({ path: "work/admin-overview.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/admin/companies");

  const mobileMenu = page.locator("aside details");
  await expect(mobileMenu.locator("summary")).toBeVisible();
  await expect(page.locator("aside > nav")).toBeHidden();
  await mobileMenu.locator("summary").click();
  await expect(mobileMenu.locator("nav")).toBeVisible();
  await mobileMenu.getByRole("link", { name: "Brands" }).click();
  await expect(page.locator("h1")).toHaveText("Brands");

  const importButton = page.locator("[data-import-brand]").first();
  await expect(importButton).toBeVisible();
  const bounds = await importButton.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => document.activeElement?.blur());
  await page.screenshot({ path: "work/admin-mobile.png", fullPage: true });
});

test("Arabic default, carousel, language and keyboard", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#cover")).toBeVisible();
  await page.locator("#next-offer").click();
  await expect(page.locator('[data-slide="1"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.locator("#cover").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-slide="2"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.locator("#previous-offer").click();
  await expect(page.locator('[data-slide="1"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  await page.locator('[data-slide="0"]').click();
  await page.locator("#locale-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.locator("h1")).toHaveText("Beauty, in good company.");
  expect(errors).toEqual([]);
});

test("catalog search, pagination, history, unknown routes, fallback images", async ({
  page,
}) => {
  await english(page);
  await page.goto("/#/brands");
  await expect(page.locator('main a[href^="#/brand/"]')).toHaveCount(8);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator('main a[href^="#/brand/"]')).toHaveCount(2);
  await page.goBack();
  await expect(page.locator('main a[href^="#/brand/"]')).toHaveCount(8);
  await page.locator("#catalog-search").fill("luma");
  await expect(page.locator('main a[href^="#/brand/"]')).toHaveCount(1);
  await expect(page).toHaveURL(/q=luma/);
  await page.locator("#catalog-search").fill("nothing-matches");
  await expect(page.getByText("No matches just yet")).toBeVisible();
  await page.locator("#clear-search").click();
  await expect(page.locator("#catalog-search")).toBeFocused();
  await page.goto("/#/brand/luma");
  await expect(page.locator("main table tbody tr")).toHaveCount(8);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("main table tbody tr")).toHaveCount(1);
  await page.goto("/#/brand/missing");
  await expect(page.locator("h1")).toHaveText("Page not found");
  await page.goto("/#/missing");
  await expect(page.locator("h1")).toHaveText("Page not found");
  await page.goto("/#/brand/luma");
  await page
    .locator("main table img")
    .first()
    .evaluate((img) => {
      img.src = "https://invalid.example.test/missing.png";
    });
  await expect(page.locator("main table img").first()).toHaveAttribute(
    "src",
    "./assets/image-fallback.svg",
  );
});

test("admin validation, create, edit, persistence, deletion and reset", async ({
  page,
}) => {
  await english(page);
  await login(page);
  await page.goto("/#/admin/companies/new");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#field-name_ar")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.locator("#field-name_ar")).toBeFocused();
  await addBrand(page);
  await page.locator("#catalog-search").fill("Test brand");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("link", { name: "Edit: Test brand", exact: true })
    .click();
  await page.locator("#field-name_en").fill("Edited brand");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.reload();
  await page.goto("/#/admin/companies?q=Edited");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Delete: Edited brand", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator("#dialog-cancel")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Delete: Edited brand", exact: true })
    .click();
  await page.locator("#dialog-confirm").click();
  await expect(page.getByText("No matches just yet")).toBeVisible();
  await page.goto("/#/admin/companies?q=LUMA");
  await page.getByRole("button", { name: "Delete: LUMA", exact: true }).click();
  await page.locator("#dialog-confirm").click();
  await expect(page.locator("#admin-error")).toContainText(
    "Delete this brand’s products",
  );
  await page.goto("/#/admin");
  await page.locator("#reset-demo").click();
  await page.locator("#dialog-confirm").click();
  await expect(page.locator("#notifications")).toContainText(
    "Demo data restored",
  );
});

test("product and offer CRUD, image validation and upload", async ({
  page,
}) => {
  await english(page);
  await login(page);
  await page.goto("/#/admin/products/new");
  await page.locator("#field-name_ar").fill("منتج تجريبي");
  await page.locator("#field-name_en").fill("Test product");
  await page.locator("#field-company_id").selectOption("luma");
  await page.locator("#field-size_value").fill("30");
  await page.locator("#field-final_price").fill("199");
  await page.locator("#field-qty").fill("12");
  await page.locator("#field-discount").fill("101");
  await page
    .locator("#field-image_url")
    .fill("https://example.com/product.jpg");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#field-discount")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.locator("#field-discount").fill("15");
  await page.locator("#field-image-file").setInputFiles({
    name: "bad.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.locator("#field-image-file-error")).toContainText(
    "valid JPG",
  );
  await page
    .locator("#field-image-file")
    .setInputFiles("public/assets/campaign.webp");
  await expect(page.locator("form img")).toHaveAttribute(
    "src",
    /^(?:data:image\/webp|blob:)/,
  );
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/#\/admin\/products$/);
  await page.locator("#catalog-search").fill("Test product");
  await page
    .getByRole("link", { name: "Edit: Test product", exact: true })
    .click();
  await expect(page.locator("#field-qty")).toHaveValue("12");
  await page.locator("#field-final_price").fill("210");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.locator("#catalog-search").fill("Test product");
  await page
    .getByRole("button", { name: "Delete: Test product", exact: true })
    .click();
  await page.locator("#dialog-confirm").click();
  await expect(page.getByText("No matches just yet")).toBeVisible();
  await page.goto("/#/admin/offers/new");
  await page.locator("#field-name_ar").fill("عرض تجريبي");
  await page.locator("#field-name_en").fill("Test offer");
  await page.locator("#field-company_id").selectOption("luma");
  await page.locator("#field-description_ar").fill("عرض للاختبار");
  await page.locator("#field-description_en").fill("A test offer");
  await page.locator("#field-image_url").fill("https://example.com/offer.jpg");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.locator("#catalog-search").fill("Test offer");
  await page
    .getByRole("link", { name: "Edit: Test offer", exact: true })
    .click();
  await page.locator("#field-description_en").fill("Updated offer");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.locator("#catalog-search").fill("Test offer");
  await page
    .getByRole("button", { name: "Delete: Test offer", exact: true })
    .click();
  await page.locator("#dialog-confirm").click();
  await expect(page.getByText("No matches just yet")).toBeVisible();
});

test("dirty navigation, failed save and cross-tab revision conflict preserve form", async ({
  page,
  context,
}) => {
  await english(page);
  await login(page);
  await page.goto("/#/admin/companies/edit/luma");
  await page.locator("#field-name_en").fill("Unsaved");
  await page.locator('header a[href="#/offers"]').first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.locator("#dialog-cancel").click();
  await expect(page.locator("#field-name_en")).toHaveValue("Unsaved");
  await page.evaluate(() => {
    window.realTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function () {
      throw new DOMException("Disk full", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#form-error")).toContainText(
    "Changes were not saved",
  );
  await expect(page.locator("#field-name_en")).toHaveValue("Unsaved");
  await page.evaluate(() => {
    IDBDatabase.prototype.transaction = window.realTransaction;
  });
  const other = await context.newPage();
  await other.goto("/");
  await other.evaluate(async () => {
    const store = await import("/src/store.js");
    const data = await store.readAll();
    const item = data.companies.find((x) => x.id === "luma");
    await store.saveItem(
      "companies",
      { ...item, name_en: "Other tab" },
      item.revision,
    );
  });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.locator("#form-error")).toContainText(
    /changed in another (?:tab|window)/,
  );
  await expect(page.locator("#field-name_en")).toHaveValue("Unsaved");
});

test("storage unavailable has retry and empty catalog is recoverable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      value: {
        open() {
          throw new Error("unavailable");
        },
      },
    });
  });
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("التخزين");
  await expect(page.locator("#retry")).toBeVisible();
});

test("empty catalogs, long Arabic names and safe text rendering", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#cover").waitFor();
  await page.evaluate(async () => {
    const request = indexedDB.open("clinic-magazine", 2);
    await new Promise((resolve) => {
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(
          ["companies", "products", "offers"],
          "readwrite",
        );
        for (const c of ["companies", "products", "offers"])
          tx.objectStore(c).clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.reload();
  await expect(page.getByText("لا توجد عروض حاليًا")).toBeVisible();
  await page.goto("/#/brands");
  await expect(page.getByText("لا توجد عناصر بعد")).toBeVisible();
  await page.evaluate(async () => {
    const store = await import("/src/store.js");
    await store.saveItem(
      "companies",
      {
        id: "long",
        name_ar:
          "علامة تجارية للعناية بالبشرة والشعر ومستحضرات التجميل ذات اسم طويل للغاية",
        name_en: "<img src=x onerror=alert(1)>",
        logo_url: "",
      },
      0,
    );
  });
  await page.reload();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/#/brand/long");
  await expect(page.locator("h1")).toContainText("علامة تجارية");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(await page.locator('main img[src="x"]').count()).toBe(0);
});

test("admin editor accessibility, native select and swipe alternate", async ({
  page,
}) => {
  await english(page);
  await login(page);
  await page.goto("/#/admin/products/new");
  await page.locator("#field-company_id").focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.locator('header a[href="#/offers"]').first().click();
  await page.locator("#dialog-confirm").click();
  await page.locator("#cover").waitFor();
  const bounds = await page.locator("#cover").boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + 70);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.4, bounds.y + 75, {
    steps: 8,
  });
  await page.mouse.up();
  await expect(page.locator('[data-slide="1"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollbarColor,
    ),
  ).not.toBe("auto");
});

test("accessibility, responsive screenshots and reduced motion", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#cover").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "work/desktop-ar.png", fullPage: true });
  for (const url of ["/#/offers", "/#/brands", "/#/brand/luma", "/#/admin"]) {
    await page.goto(url);
    await page.locator("h1").waitFor();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations,
      JSON.stringify(
        results.violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
      ),
    ).toEqual([]);
  }
  await page.goto("/");
  await page.locator("#locale-toggle").click();
  await page.screenshot({ path: "work/desktop-en.png", fullPage: true });
  await login(page);
  await page.goto("/#/admin/products");
  await page.screenshot({ path: "work/admin-en.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of [
    "/#/offers",
    "/#/brands",
    "/#/brand/luma",
    "/#/admin/products/new",
  ]) {
    await page.goto(url);
    await page.locator("h1").waitFor();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/");
  await page.locator("#locale-toggle").click();
  await page.screenshot({ path: "work/mobile-ar.png", fullPage: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("#next-offer").click();
  expect(
    await page
      .locator("#cover img")
      .evaluate((img) => getComputedStyle(img).animationName),
  ).toBe("none");
});
