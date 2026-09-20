import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { messages } from "../src/i18n.js";

async function english(page) {
  await page.goto("/");
  await page.locator("#locale-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}
async function login(page) {
  await page.goto("/#/admin");
  await page.locator("#field-user").fill("demo");
  await page.locator("#field-pass").fill("clinic");
  await page.locator("#login-form button[type=submit]").click();
  await expect(page.locator("h1")).toHaveText("Overview");
}
async function addBrand(page, name = "Test brand") {
  await page.goto("/#/admin/companies/new");
  await page.locator("#field-name_ar").fill("علامة للاختبار");
  await page.locator("#field-name_en").fill(name);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/#\/admin\/companies$/);
}

test("localization dictionaries have complete parity", () => {
  expect(Object.keys(messages.ar).sort()).toEqual(
    Object.keys(messages.en).sort(),
  );
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
  await expect(page.locator("main article")).toHaveCount(8);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("main article")).toHaveCount(1);
  await page.goto("/#/brand/missing");
  await expect(page.locator("h1")).toHaveText("Page not found");
  await page.goto("/#/missing");
  await expect(page.locator("h1")).toHaveText("Page not found");
  await page.goto("/#/brand/luma");
  await page
    .locator("article img")
    .first()
    .evaluate((img) => {
      img.src = "https://invalid.example.test/missing.png";
    });
  await expect(page.locator("article img").first()).toHaveAttribute(
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
  await expect(page.locator("#login-form")).toBeVisible();
  await login(page);
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
    /^data:image\/webp/,
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
    "changed in another tab",
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
    const request = indexedDB.open("clinic-magazine", 1);
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
