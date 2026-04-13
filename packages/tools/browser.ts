/**
 * Browser tool — fetch and extract visible text from a web page.
 *
 * Powered by Playwright (Chromium, headless mode).  Returns the page
 * title and the first 5 000 characters of visible body text, which is
 * enough context for the LLM without blowing up the prompt.
 *
 * Only `http:` and `https:` protocols are allowed; all others are
 * rejected to prevent `file://` or `javascript:` abuse.
 *
 * @module tools/browser
 */

import { chromium } from 'playwright';
import type { ITool } from './types';

/** Maximum number of visible-text characters returned to the agent. */
const MAX_CONTENT_CHARS = 5_000;

/**
 * Tool instance for fetching web pages.
 *
 * Input: `{ url: string }`
 * Output: `{ title: string, content: string }`
 */
export const browserTool: ITool = {
    name: 'browser_fetch',
    description: 'Fetch the title and visible text of a web page. ' + 'Input: { url: string }',

    /**
     * Navigate to `url`, extract the page title and visible text.
     *
     * @param input     - Tool input object.
     * @param input.url - The HTTP(S) URL to fetch.
     * @returns `{ title, content }` where `content` is truncated to `MAX_CONTENT_CHARS`.
     * @throws {Error} When the URL is invalid, uses an unsupported protocol, or the page times out.
     */
    async execute({ url }) {
        if (typeof url !== 'string' || url.trim() === '') {
            throw new Error('"url" must be a non-empty string');
        }

        /* Validate URL format and restrict to http/https. */
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new Error(`Invalid URL: ${url}`);
        }

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error(
                `Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`
            );
        }

        const browser = await chromium.launch({ headless: true });

        try {
            const page = await browser.newPage();
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

            const title = await page.title();
            const content = await page.evaluate(() => document.body?.innerText ?? '');

            return {
                title,
                /* Truncate to keep the LLM context manageable. */
                content: content.slice(0, MAX_CONTENT_CHARS)
            };
        } finally {
            await browser.close();
        }
    }
};
