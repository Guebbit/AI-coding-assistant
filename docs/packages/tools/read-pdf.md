# Tool: `read_pdf`

## What it does in plain English

> "Extract all the text from this PDF so I can read and reason about it."

PDFs are binary files — you cannot just `cat` them. This tool uses the `pdf-parse` library to extract the underlying text content from any PDF, page by page.

## Input

The tool accepts either a file path (disk) or inline base64 data (e.g. from an API upload). When both are provided, `data` takes precedence.

**From disk:**
```json
{ "path": "relative/path/to/file.pdf" }
```

**From upload (base64):**
```json
{ "data": "<base64-encoded PDF>" }
```

## Output

```json
{
  "text": "Full extracted text from the PDF...",
  "pages": 12
}
```

- `text`: all text content concatenated across all pages
- `pages`: total page count

## How it works internally

```text
PDF from disk OR base64 data from upload
    |
Tool resolves path against project root (rejects traversal) or uses base64 directly
    |
pdf-parse library reads binary PDF
    |
Extracts text layer from each page
    |
Returns: { text: "...", pages: N }
    |
Agent can now reason about the PDF content
```

There is also a dedicated upload endpoint: `POST /upload/read-pdf` (accepts `multipart/form-data`).

## Real-life use cases

### Use case 1 -- Summarise a technical specification

You have a 30-page API spec or RFC PDF and you want the key points.

**Prompt:**
```
Read data/specs/api-specification.pdf and summarise the authentication section.
```

**What happens:**
1. Tool extracts all text from the PDF
2. Agent reads the text and finds the auth section
3. Returns a clear summary

---

### Use case 2 -- Extract action items from a meeting agenda PDF

**Prompt:**
```
Read data/examples/meeting-agenda.pdf and list all action items with their owners.
```

---

### Use case 3 -- Answer a question from a document

**Prompt:**
```
Read data/docs/employee-handbook.pdf and tell me what the vacation policy is.
```

Agent extracts all text, searches for the vacation section, and quotes the relevant policy.

---

### Use case 4 -- Multi-step: read PDF then compare with code

**Prompt:**
```
Read data/specs/spec.pdf and check if packages/agent/agent.ts implements the described loop correctly.
```

**Steps:**
```
Step 1: read_pdf    ->  { "path": "data/specs/spec.pdf" }
Step 2: read_file   ->  { "path": "packages/agent/agent.ts" }
Step 3: action: "none"  ->  Agent compares spec vs implementation
```

---

## Good test prompts

| What you type | What the agent does |
|---|---|
| `Read data/examples/spec.pdf and summarise the top 5 key points.` | Extracts text, summarises |
| `How many pages does data/docs/manual.pdf have?` | Returns `pages` count |
| `Read data/contracts/agreement.pdf and find any mention of payment terms.` | Extracts text, searches for section |

## Notes

- Uses the `pdf-parse` library.
- Path is restricted to project root boundaries.
- Returns extracted text and page count.
