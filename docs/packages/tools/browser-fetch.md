# Tool: `browser_fetch`

::: tip TL;DR
Opens a URL in headless Chromium, waits for JS to render, returns title + visible text.
:::

## Purpose

Fetch title and visible page text using Playwright (Chromium, headless).

## What it does in plain English

> "Open this URL in a real headless browser, wait for the page to load, and give me the title and all visible text."

This is different from a plain HTTP GET — it actually **renders JavaScript**, waits for dynamic content, then extracts text. Perfect for modern web apps that load content after the initial HTML.

## Input

```json
{ "url": "https://example.com" }
```

## Output

```json
{ "title": "Example Domain", "content": "This domain is for use in illustrative examples..." }
```

`content` is truncated to the first 5 000 characters to keep prompts manageable.

## Safety

- URL must be a valid URL string
- Protocol must be exactly `http` or `https` — `file://`, `ftp://`, `javascript:` etc. are rejected

## Runtime setup

- `browserTool` is **enabled by default** in `apps/api/index.ts`
- Chromium is installed automatically during `npm install` (the project `postinstall` script runs `playwright install chromium`)
- You do **not** need to install Chromium separately

## How the agent uses it (step-by-step)

```mermaid
flowchart TD
    A["You ask: 'What does the Ollama homepage say about its features?'"] --> B["Agent thinks: 'I should fetch that page'"]
    B --> C["Agent calls: browser_fetch → { url: 'https://ollama.com' }"]
    C --> D["Playwright launches Chromium (headless), navigates to URL"]
    D --> E["Page renders fully (JS executes, dynamic content appears)"]
    E --> F["Tool extracts: title + innerText of the body"]
    F --> G["Agent reads the content and summarises the features for you"]
```

## Real-life use cases

### Use case 1 — Research a library before using it

**Prompt:**

```
Fetch https://vitepress.dev and summarise what VitePress is in 2 sentences.
```

What happens:

1. Chromium loads the VitePress homepage
2. Full text extracted (including JS-rendered sections)
3. Agent summarises in plain English

---

### Use case 2 — Check a package's latest changelog

**Prompt:**

```
Fetch https://github.com/ollama/ollama/releases and tell me what changed in the latest release.
```

---

### Use case 3 — Scrape a documentation page

**Prompt:**

```
Fetch https://docs.docker.com/compose/install/ and give me the Linux install steps.
```

---

### Use case 4 — Check if a site is up and what it says

**Prompt:**

```
Fetch http://localhost:3000 and tell me if Open WebUI loaded correctly.
```

Agent fetches the page, checks the title/content, and tells you whether it looks like a normal Open WebUI page or an error.

---

## Good test prompts

| What you type                                               | What the agent fetches                  |
| ----------------------------------------------------------- | --------------------------------------- |
| `Fetch https://example.com and summarise the main text.`    | `https://example.com`                   |
| `What does the npm page for express say about its purpose?` | `https://www.npmjs.com/package/express` |
| `Summarise the Playwright docs homepage.`                   | `https://playwright.dev`                |
| `Is https://httpstat.us/200 returning OK?`                  | `https://httpstat.us/200`               |
