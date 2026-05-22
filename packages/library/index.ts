/**
 * Public surface of the library package.
 *
 * Re-exports all types and core functions so consumers can import from
 * a single entry point:
 *
 * ```typescript
 * import { runImport, searchLibrary } from '../library';
 * import type { IArticleEntry, IImportResult } from '../library';
 * ```
 *
 * @module library
 */

export * from './types';
export { extractPageRange, extractFullText } from './pdf-extraction';
export { discoverStructure, importPdf, runImport } from './ingestion';
export { searchLibrary } from './search';
export {
    ensureCollection,
    deleteCollection,
    collectionName,
    upsertPoint,
    searchPoints
} from './library-store';
