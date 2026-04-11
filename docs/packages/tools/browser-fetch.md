# Tool: `browser_fetch`

## Purpose

Fetch title and visible page text using Playwright (Chromium, headless).

## Input

```json
{ "url": "https://example.com" }
```

## Output

```json
{ "title": "...", "content": "..." }
```

`content` is truncated to first 5000 chars.

## Safety

- URL must be valid
- Protocol must be `http` or `https`

## Runtime setup

- `browserTool` is enabled by default in `apps/api/src/index.ts`
- Chromium is installed automatically during `npm install` (`postinstall`)

## Good test prompts

- "Fetch the title and summary text from https://example.com"
