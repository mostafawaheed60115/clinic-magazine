import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "work/test-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: "msedge",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 5174",
    url: "http://127.0.0.1:5174",
    env: {
      VITE_DEMO_MODE: "true",
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_PUBLISHABLE_KEY: "",
    },
    reuseExistingServer: true,
  },
});
