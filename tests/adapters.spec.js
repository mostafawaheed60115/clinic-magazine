import { test, expect } from "@playwright/test";
import {
  importRows,
  parseCsv,
  productExportRows,
  readCsvFile,
  serializeCsv,
} from "../src/csv.js";

test("CSV exports round-trip safely and preserve blank override fields", () => {
  const brand = { id: "brand-1", name_en: "Test brand" };
  const rows = productExportRows(brand, [
    {
      id: "product-1",
      revision: 3,
      name_en: "=unsafe",
      name_ar: "منتج",
      size_value: 30,
      size_unit: "ml",
      qty: null,
      discount: null,
      final_price: 120,
      product_url: null,
      img_url: "https://example.com/image.webp",
    },
  ]);
  const csv = serializeCsv(rows);
  expect([...new TextEncoder().encode(csv).slice(0, 3)]).toEqual([
    0xef, 0xbb, 0xbf,
  ]);
  expect(csv.split("\r\n", 1)[0]).toBe(
    "\uFEFFname_en,name_ar,size_value,size_unit,qty,discount,final_price,product_url,image_url,brand_id,product_id,revision",
  );
  const parsed = parseCsv(csv);
  const imported = importRows(parsed, brand)[0];
  expect(imported).toMatchObject({
    brand_id: "brand-1",
    product_id: "product-1",
    name_en: "=unsafe",
    qty: "",
    discount: "",
    product_url: "",
    image_url: "https://example.com/image.webp",
  });
});

test("CSV import stops when Arabic was already replaced by question marks", () => {
  const text = "name_en\tname_ar\tfinal_price\r\ntest unit\t???? ????\t800\r\n";
  expect(() => importRows(parseCsv(text), { id: "brand-1" })).toThrow(
    expect.objectContaining({ code: "csv_arabic_corrupt", row: 2 }),
  );
});

test("older exports with version and brand-name columns remain importable", () => {
  const text =
    "schema_version,brand_id,brand_name_en,product_id,revision,name_en,name_ar,final_price\r\n1,brand-1,Test brand,product-1,3,Cream,كريم,120\r\n";
  const [row] = importRows(parseCsv(text), {
    id: "brand-1",
    name_en: "Test brand",
  });
  expect(row).toMatchObject({
    brand_id: "brand-1",
    product_id: "product-1",
    revision: "3",
    name_ar: "كريم",
  });
});

test("CSV imports preserve exported identity while applying edits", () => {
  const brand = { id: "brand-1", name_en: "Test brand" };
  const exported = productExportRows(brand, [
    {
      id: "product-1",
      revision: 7,
      name_en: "Original name",
      name_ar: "الاسم الأصلي",
      size_value: 30,
      size_unit: "ml",
      qty: 2,
      discount: 0,
      final_price: 120,
      product_url: null,
      img_url: "https://example.com/old.webp",
    },
  ]);
  exported[0].name_en = "Edited name";
  exported[0].image_url = "https://example.com/new.webp";
  exported[0].name_ar = "";

  const [imported] = importRows(parseCsv(serializeCsv(exported)), brand);
  expect(imported).toMatchObject({
    brand_id: "brand-1",
    product_id: "product-1",
    revision: "7",
    name_en: "Edited name",
    name_ar: "",
    image_url: "https://example.com/new.webp",
  });
});

test("CSV parser rejects duplicate headers and rows with extra cells", () => {
  expect(() =>
    parseCsv("name_en,name_ar,final_price,name_en\nA,منتج,12,B"),
  ).toThrow(expect.objectContaining({ code: "csv_duplicate_headers" }));
  expect(() =>
    parseCsv("name_en,name_ar,final_price\nA,منتج,12,extra"),
  ).toThrow(expect.objectContaining({ code: "csv_extra_fields", row: 2 }));
});

test("CSV parser detects locale delimiters and preserves Arabic text", () => {
  expect(
    parseCsv('name_en;name_ar;final_price\r\nLotion;"كريم; مرطب";١٢٣,٥'),
  ).toEqual([
    { name_en: "Lotion", name_ar: "كريم; مرطب", final_price: "١٢٣,٥" },
  ]);
  expect(parseCsv("name_en،name_ar،final_price\nLotion،مرطب،123٫5")).toEqual([
    { name_en: "Lotion", name_ar: "مرطب", final_price: "123٫5" },
  ]);
});

test("CSV reader supports UTF-16 Excel exports and Windows-1256 Arabic", async () => {
  const utf16Text = "name_en,name_ar,final_price\r\nCream,مرطب,12.5";
  const utf16Bytes = Uint8Array.from([
    0xff,
    0xfe,
    ...[...utf16Text].flatMap((char) => {
      const code = char.charCodeAt(0);
      return [code & 0xff, code >> 8];
    }),
  ]);
  const legacyPrefix = new TextEncoder().encode(
    "name_en,name_ar,final_price\nCream,",
  );
  const legacySuffix = new TextEncoder().encode(",12.5");
  const legacyBytes = Uint8Array.from([
    ...legacyPrefix,
    0xca,
    0xed,
    0xd3,
    0xca,
    ...legacySuffix,
  ]);
  const asFile = (bytes) => ({ arrayBuffer: async () => bytes.slice().buffer });

  expect(parseCsv(await readCsvFile(asFile(utf16Bytes)))[0].name_ar).toBe(
    "مرطب",
  );
  expect(parseCsv(await readCsvFile(asFile(legacyBytes)))[0].name_ar).toBe(
    "تيست",
  );
});

test("Arabic and locale-formatted numeric fields normalize without changing blanks", () => {
  const brand = { id: "brand-1", name_en: "Test brand" };
  const [arabic] = importRows(
    [
      {
        final_price: "١٬٢٣٤٫٥",
        size_value: "1.234,5",
        qty: "2,500",
        discount: "",
        size_unit: "ملليلتر",
      },
    ],
    brand,
  );
  expect(arabic).toMatchObject({
    final_price: "1234.5",
    size_value: "1234.5",
    qty: "2500",
    discount: "",
    size_unit: "ml",
  });
});

test.describe("client adapters", () => {
  test("timed-out uploads clean up only after late completion", async ({
    page,
  }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const { uploadImage } = await import("/src/upload.js");
      let finish;
      const removed = [];
      const pending = new Promise((resolve) => {
        finish = resolve;
      });
      const storageClient = {
        storage: {
          from: () => ({
            upload: () => pending,
            getPublicUrl: (key) => ({
              data: {
                publicUrl: `https://twllyczdtmitsupfvjgx.supabase.co/storage/v1/object/public/clinic-images/${key}`,
              },
            }),
            remove: async (keys) => {
              removed.push(...keys);
              return { error: null };
            },
          }),
        },
      };
      let code;
      try {
        await uploadImage(
          { blob: new Blob(["test"], { type: "image/webp" }) },
          { storageClient, timeoutMs: 10 },
        );
      } catch (error) {
        code = error.code;
      }
      const before = removed.length;
      finish({ error: null });
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { code, before, after: removed.length };
    });
    expect(result).toEqual({ code: "timeout", before: 0, after: 1 });
  });
  test("demo authentication survives refresh without storing a password", async ({
    page,
  }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const auth = await import("/src/auth.js");
      await auth.signIn("demo", "clinic");
      const before = auth.getAuthState();
      const stored = Object.values(localStorage).join(" ");
      await auth.signOut();
      return {
        mode: before.mode,
        username: before.profile?.username,
        hasPlaintextPassword: stored.includes("clinic"),
      };
    });
    expect(result.mode).toBe("demo");
    expect(result.username).toBe("demo");
    expect(result.hasPlaintextPassword).toBe(false);
  });

  test("image preparation returns bounded WebP output and revokes preview URLs", async ({
    page,
  }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const { prepareImage, releaseImage } = await import("/src/upload.js");
      const canvas = document.createElement("canvas");
      canvas.width = 40;
      canvas.height = 24;
      const context = canvas.getContext("2d");
      context.fillStyle = "#d7a5c7";
      context.fillRect(0, 0, 40, 24);
      const source = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      const prepared = await prepareImage(
        new File([source], "source.png", { type: "image/png" }),
      );
      const details = {
        type: prepared.blob.type,
        width: prepared.width,
        height: prepared.height,
        originalBytes: prepared.originalBytes,
        bytes: prepared.bytes,
        preview: prepared.previewUrl.startsWith("blob:"),
      };
      releaseImage(prepared);
      return details;
    });
    expect(result.type).toBe("image/webp");
    expect(result.width).toBe(40);
    expect(result.height).toBe(24);
    expect(result.bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(result.preview).toBe(true);
  });

  test("invalid image input is rejected before any upload request", async ({
    page,
  }) => {
    await page.goto("/");
    const message = await page.evaluate(async () => {
      const { prepareImage } = await import("/src/upload.js");
      try {
        await prepareImage(
          new File(["not an image"], "bad.txt", { type: "text/plain" }),
        );
        return "accepted";
      } catch (error) {
        return error.code;
      }
    });
    expect(message).toBe("invalid_type");
  });

  test("catalog cache invalidates after a same-tab write", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const auth = await import("/src/auth.js");
      const store = await import("/src/store.js");
      await auth.signIn("demo", "clinic");
      const before = await store.readAll();
      const item = before.companies[0];
      const marker = `cache-${Date.now()}`;
      await store.saveItem(
        "companies",
        { ...item, name_en: marker, name_ar: marker },
        item.revision,
      );
      const after = await store.readAll();
      return after.companies.some(
        (company) => company.id === item.id && company.name_en === marker,
      );
    });
    expect(result).toBe(true);
  });

  test("managed image cleanup accepts only this bucket", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const { managedImageKey } = await import("/src/cloud.js");
      return {
        owned: managedImageKey(
          "https://twllyczdtmitsupfvjgx.supabase.co/storage/v1/object/public/clinic-images/clinic/test.webp",
        ),
        external: managedImageKey("https://example.com/clinic/test.webp"),
        traversal: managedImageKey(
          "https://twllyczdtmitsupfvjgx.supabase.co/storage/v1/object/public/clinic-images/clinic/%2e%2e%2fother.webp",
        ),
      };
    });
    expect(result).toEqual({
      owned: "clinic/test.webp",
      external: null,
      traversal: null,
    });
  });
});
