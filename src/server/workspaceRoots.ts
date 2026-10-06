/**
 * Workspace root boundary validation for host-filesystem access
 * (audit finding SEC-03).
 *
 * POST /api/scan-directory accepts a client-supplied directory path and
 * walks the host filesystem, ingesting file contents into the project
 * store. Without a boundary check, any caller could scan (and read the
 * contents of) arbitrary locations such as /etc or C:\Windows.
 *
 * Configuration — MCP_ALLOWED_WORKSPACE_ROOTS:
 *   Comma-separated list of absolute or cwd-relative paths
 *   (e.g. "/workspace,/projects,./src"). Parsed once at startup;
 *   malformed configuration aborts the process (fail-fast, fail-closed).
 *   Default: "/workspace".
 *
 * Validation strategy (fail-closed, defense in depth):
 *   1. Lexical boundary — path.resolve(dirPath) must be a configured
 *      root itself or located underneath one. Rejects absolute paths
 *      outside the roots and `..` traversal.
 *   2. Symlink boundary — the canonical location (fs.realpathSync) of
 *      the candidate must still be underneath the canonical location of
 *      a root. Rejects symlinks planted inside an allowed root that
 *      point outside it.
 *
 * Client-facing error messages are generic: they never echo the resolved
 * absolute path nor the configured roots (no filesystem-structure leak);
 * details are logged server-side only. Path comparisons are
 * case-insensitive on Windows (win32) and case-sensitive elsewhere.
 */

import fs from 'fs';
import path from 'path';
import { logger } from './logger';

const DEFAULT_WORKSPACE_ROOTS = '/workspace';

/** Windows filesystems are case-insensitive; POSIX typically are not. */
const CASE_INSENSITIVE_FS = process.platform === 'win32';

/** Validated workspace roots configuration (parsed once at startup). */
export interface WorkspaceRootsConfig {
  /** Absolute, lexically-resolved allowed roots. */
  roots: string[];
}

/** Result of validating a scan-directory request path. */
export type ScanPathValidation =
  | { ok: true; resolvedPath: string }
  | { ok: false; status: 400 | 403 | 404; error: string };

/**
 * Parses and validates allowed workspace roots from the environment.
 * Throws (aborting startup) on malformed configuration: an empty root
 * list would make /api/scan-directory reject every request, which is
 * certainly a misconfiguration and must not pass silently.
 */
export function parseWorkspaceRootsConfig(env: NodeJS.ProcessEnv): WorkspaceRootsConfig {
  const raw = env.MCP_ALLOWED_WORKSPACE_ROOTS;
  const list = raw === undefined || raw.trim() === '' ? DEFAULT_WORKSPACE_ROOTS : raw;

  const entries = list
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new Error(
      `Invalid MCP_ALLOWED_WORKSPACE_ROOTS "${raw}": expected a comma-separated list of paths`
    );
  }

  if (entries.some((entry) => entry.includes('\0'))) {
    throw new Error('Invalid MCP_ALLOWED_WORKSPACE_ROOTS: paths must not contain null bytes');
  }

  const roots = [...new Set(entries.map((entry) => path.resolve(entry)))];
  return { roots };
}

/** Case-folds a path when the filesystem requires it for comparison. */
function fold(p: string): string {
  return CASE_INSENSITIVE_FS ? p.toLowerCase() : p;
}

/**
 * Lexical boundary check: resolves `candidate` and returns whether it is
 * one of `roots` itself or located underneath one of them. Both sides are
 * resolved with path.resolve() first, so relative candidates and `..`
 * segments are normalized before comparison. Sibling paths that merely
 * share a prefix (e.g. "/workspace-2" vs root "/workspace") are rejected.
 */
export function isPathWithinRoots(candidate: string, roots: string[]): boolean {
  const resolved = fold(path.resolve(candidate));
  return roots.some((root) => {
    const boundary = fold(path.resolve(root));
    return resolved === boundary || resolved.startsWith(boundary + path.sep);
  });
}

/** fs.realpathSync with a null fallback (missing or unreadable paths). */
function realpathOrNull(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** Server-side rejection log; never included in client responses. */
function logRejection(
  reason: string,
  dirPath: string,
  resolvedPath: string,
  roots: string[]
): void {
  logger.warn('scan_directory_rejected', { reason, path: dirPath, resolved: resolvedPath, roots });
}

/**
 * Full validation pipeline for POST /api/scan-directory's `dirPath`.
 *
 * Boundary checks run BEFORE any existence probing, so the endpoint
 * cannot be used as a filesystem oracle for locations outside the
 * allowed roots. Error messages echo only the client-supplied path —
 * never the resolved absolute path or the configured roots.
 */
export function validateScanDirectoryPath(
  dirPath: unknown,
  config: WorkspaceRootsConfig
): ScanPathValidation {
  if (typeof dirPath !== 'string' || dirPath === '') {
    return { ok: false, status: 400, error: 'Directory path is required' };
  }
  if (dirPath.includes('\0')) {
    return { ok: false, status: 400, error: 'Directory path contains forbidden null bytes' };
  }

  // 1. Lexical boundary (rejects absolute paths outside roots and `..`).
  const resolvedPath = path.resolve(dirPath);
  if (!isPathWithinRoots(resolvedPath, config.roots)) {
    logRejection('outside_workspace_roots', dirPath, resolvedPath, config.roots);
    return {
      ok: false,
      status: 403,
      error: 'Directory path is outside the allowed workspace roots',
    };
  }

  // Existence/type checks only after the boundary is confirmed.
  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return { ok: false, status: 400, error: `Path is not a directory: ${dirPath}` };
    }
  } catch {
    return { ok: false, status: 404, error: `Directory does not exist: ${dirPath}` };
  }

  // 2. Symlink boundary: re-check the canonical location. Roots that
  //    cannot be realpathed (e.g. not created yet) fall back to their
  //    lexical form.
  const realCandidate = realpathOrNull(resolvedPath);
  if (realCandidate === null) {
    return { ok: false, status: 404, error: `Directory does not exist: ${dirPath}` };
  }
  const realRoots = config.roots.map((root) => realpathOrNull(root) ?? root);
  if (!isPathWithinRoots(realCandidate, realRoots)) {
    logRejection('symlink_escape', dirPath, realCandidate, config.roots);
    return {
      ok: false,
      status: 403,
      error: 'Directory path is outside the allowed workspace roots',
    };
  }

  return { ok: true, resolvedPath };
}
