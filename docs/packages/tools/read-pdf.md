# tools/read_pdf

## What

Extracts text from PDF files.

## Input

```json
{ "path": "relative/path/to/file.pdf" }
```

## Notes

- Uses the `pdf-parse` library.
- Path is restricted to project root boundaries.
- Returns extracted text and page count.
