# Scenario 5.3 -- PDF reading

::: tip TL;DR
Read a PDF, verify the agent extracts text and reasons about the content.
:::

**Goal**: verify read_pdf extracts text from a PDF and the agent can reason about it.

> Place any PDF at `data/examples/spec.pdf` first.

**Prompt:**

```
Read data/examples/spec.pdf and summarise the top 5 key points.
```

**Expected tool**: `read_pdf`

**What should happen:**

```
Step 1: read_pdf  ->  { "path": "data/examples/spec.pdf" }
        returns: { text: "...", pages: N }
Step 2: action: "none"  ->  summarises key points
```

---

← [Back to Scenarios](index.md)
