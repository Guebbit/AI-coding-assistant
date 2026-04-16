# Scenario 5 -- Browser fetch

::: tip TL;DR
Fetch a web page, verify the agent gets the title and content back.
:::

**Goal**: verify Playwright runs, fetches a page, and the agent summarises content.

> Requires `browser_fetch` enabled (it is by default).

**Prompt:**

```
Fetch https://example.com and summarise the title and main text.
```

**Expected tool**: `browser_fetch`

**What should happen:**

```
Step 1: browser_fetch  ->  { "url": "https://example.com" }
        returns: { title: "Example Domain", content: "This domain is for..." }
Step 2: action: "none"
        answer: summary of the page
```

**What to check in logs:**

- `tool:result` contains `title` and `content` fields
- Content is truncated to 5000 chars

**Level up**: try fetching a real documentation page:

```
Fetch https://ollama.com and summarise what Ollama is in 3 bullet points.
```

---

← [Back to Scenarios](index.md)
