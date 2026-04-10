import { chromium } from "playwright";
import type { Tool } from "./types";

/**
 * Browser automation tool powered by Playwright (Chromium headless).
 *
 * Supports scraping and interaction with web pages.
 * Returns the page title and the first 5 000 characters of visible text.
 *
 * Usage note: run `npx playwright install chromium` once before using this tool.
 */
export const browserTool: Tool = {
  name: "browser_fetch",
  description:
    "Fetch the title and visible text of a web page. " +
    "Input: { url: string }",

  async execute({ url }) {
    if (typeof url !== "string" || url.trim() === "") {
      throw new Error('"url" must be a non-empty string');
    }

    // Validate URL and restrict to http/https
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(
        `Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`
      );
    }

    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

      const title = await page.title();
      const content = await page.evaluate(
        () => document.body?.innerText ?? ""
      );

      return {
        title,
        // Truncate to keep context manageable for the LLM
        content: content.slice(0, 5_000),
      };
    } finally {
      await browser.close();
    }
  },
};
