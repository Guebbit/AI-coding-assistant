/**
 * Language detection helpers for source files.
 *
 * @module shared/language
 */

const TS_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);
const LANGUAGE_MAP: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    cs: 'csharp', cpp: 'cpp', c: 'c', php: 'php', swift: 'swift',
    kt: 'kotlin', scala: 'scala', sh: 'shell', bash: 'shell',
    html: 'html', css: 'css', scss: 'css', json: 'json', yaml: 'yaml', md: 'markdown',
};

export function isTypeScriptLike(language?: string, filename?: string): boolean {
    if (language) return language.toLowerCase().startsWith('ts') || language.toLowerCase() === 'typescript';
    if (filename) {
        const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
        return TS_EXTENSIONS.has(ext);
    }
    return false;
}

export function isJavaScriptLike(language?: string, filename?: string): boolean {
    if (language) return language.toLowerCase().startsWith('js') || language.toLowerCase() === 'javascript';
    if (filename) {
        const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
        return JS_EXTENSIONS.has(ext);
    }
    return false;
}

export function inferLanguage(language?: string, filename?: string): string {
    if (language?.trim()) return language.trim().toLowerCase();
    if (filename) {
        const dotIndex = filename.lastIndexOf('.');
        if (dotIndex !== -1) {
            const ext = filename.slice(dotIndex + 1).toLowerCase();
            if (LANGUAGE_MAP[ext]) return LANGUAGE_MAP[ext];
        }
    }
    return 'plaintext';
}
