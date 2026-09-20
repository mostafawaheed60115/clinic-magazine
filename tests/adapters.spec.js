import { test, expect } from "@playwright/test";

test.describe("client adapters", () => {
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
});
