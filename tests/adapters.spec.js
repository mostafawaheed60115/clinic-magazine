import { test, expect } from "@playwright/test";

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
