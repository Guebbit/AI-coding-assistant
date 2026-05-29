# PR #110 — Workspace Root Write Guards (Last Merge Summary)

## Overview

**Title:** `feat: enforce workspace-root write guards`  
**Branch:** `copilot/implement-workspace-root-overhaul`  
**Files changed:** 15 (270 insertions, 72 deletions)

## Key Changes

### 1. New Concept: `AGENT_WORKSPACE_ROOT`
- Replaces the old `PROJECT_OUTPUT_ROOT` env var
- Controls the root directory for both read and write file operations
- Defaults to `process.cwd()` when not set
- New function: `getWorkspaceRoot()` in `packages/shared/path-safety.ts`

### 2. New Module: `packages/shared/write-guard.ts`
A comprehensive write-path guard system that blocks writes to:
- **`.gitignore`-matched paths** — calls `git check-ignore` to see if a path is git-ignored
- **Denylist patterns** (`AGENT_WRITE_DENYLIST` env var) — comma-separated glob patterns (default: `.git,.env,.env.*`)

**Exported function:** `assertWritePathAllowed(resolvedPath: string): Promise<void>`
- Throws `Error` with descriptive message when write is blocked
- Checks gitignore first, then denylist

**Internal helpers:**
- `parseWriteDenylist()` — parses `AGENT_WRITE_DENYLIST` env var
- `globToRegExp(pattern)` — converts glob patterns to RegExp
- `isMatchedByWriteDenylist(relativePath)` — checks denylist match
- `isMatchedByGitIgnore(workspaceRoot, relativePath)` — checks gitignore via `git check-ignore`

### 3. Modified: `packages/shared/path-safety.ts`
- Added `getWorkspaceRoot()` — resolves `AGENT_WORKSPACE_ROOT` or falls back to `cwd()`
- `resolveSafePath()` now uses `getWorkspaceRoot()` instead of `process.cwd()` directly
- Error messages changed from "project root" to "workspace root"

### 4. Modified: `packages/tools/fs.write.ts`
- **Removed:** `PROJECT_OUTPUT_ROOT` constant
- **Now uses:** `getWorkspaceRoot()` to determine output directory
- **Added:** `assertWritePathAllowed(resolvedPath)` check before writing
- Import changed: added `assertWritePathAllowed`, `getWorkspaceRoot` from shared

### 5. Modified: `packages/tools/project.scaffold.ts`
- **Removed:** `PROJECT_OUTPUT_ROOT` constant
- **Now uses:** `getWorkspaceRoot()` for the output target path
- **Added:** `assertWritePathAllowed(targetPath)` check before scaffolding
- Import changed: added `assertWritePathAllowed`, `getWorkspaceRoot` from shared

### 6. Modified: `packages/tools/fs.read.ts`
- Minor: updated to use workspace-relative path resolution

### 7. Modified: `packages/shared/safe-read-file.ts`
- Updated path resolution to align with workspace root semantics

### 8. New Tests: `tests/unit/tools/fs.write.test.ts`
- 4 new tests covering:
  - Blocking writes to gitignored paths
  - Blocking writes to denylist patterns
  - Allowing writes to safe paths
  - Verifying assertWritePathAllowed integration

### 9. Updated Tests: `tests/unit/shared/path-safety.test.ts`
- Added tests for `getWorkspaceRoot()` with and without `AGENT_WORKSPACE_ROOT`

## New Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_WORKSPACE_ROOT` | `process.cwd()` | Root directory for file tools (read + write) |
| `AGENT_WRITE_DENYLIST` | `.git,.env,.env.*` | Comma-separated glob patterns that block writes |

## API / FE Impact

- **No new REST endpoints** — this is a backend security hardening change
- **No changes to request/response schemas**
- **Behavioral change:** `write_file` and `scaffold_project` tools now reject writes to gitignored paths and denylist patterns
- **Error messages changed:** "project root" → "workspace root" in path safety errors
- The FE should handle potential new error messages from write operations:
  - `Write blocked for "<path>": path is ignored by .gitignore`
  - `Write blocked for "<path>": path matches AGENT_WRITE_DENYLIST entry "<pattern>"`

## Documentation Updated
- `docs/packages/tools/write-file.md` — updated env var references
- `docs/packages/tools/scaffold-project.md` — updated env var references
- `docs/packages/tools/index.md` — updated overview
- `docs/use-the-application.md` — updated configuration section
