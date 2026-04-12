import fs from "fs/promises";
import path from "path";
import { PDFParse } from "pdf-parse";
import type { Tool } from "./types";

function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(process.cwd(), filePath);
  const root = path.resolve(process.cwd());
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error("Access denied: path is outside the project root");
  }
  return resolved;
}

export const readPdfTool: Tool = {
  name: "read_pdf",
  description: "Read text from a PDF file. Input: { path: string }",

  async execute({ path: pdfPath }) {
    if (typeof pdfPath !== "string" || pdfPath.trim() === "") {
      throw new Error('"path" must be a non-empty string');
    }

    const safePath = resolveSafePath(pdfPath);
    const buffer = await fs.readFile(safePath);
    const parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    await parser.destroy();

    return {
      path: pdfPath,
      pageCount: parsed.total,
      text: parsed.text.trim(),
    };
  },
};
