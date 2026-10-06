/**
 * AST/Tree-sitter Language-Agnostic Specification - Section 8
 * Security Model & Path Validation
 */

import path from 'path';
import fs from 'fs';
import { SecurityError } from './errors';
import { serverConfig, SecurityConfig } from './config';

const IS_WINDOWS = process.platform === 'win32';

/**
 * Normalizes path for case-insensitive comparisons on Windows and case-sensitive elsewhere.
 */
function normalizeCase(p: string): string {
  return IS_WINDOWS ? p.toLowerCase() : p;
}

/**
 * Validates file access against security boundaries.
 * Throws SecurityError on violation.
 */
export function validateFileAccess(
  filePath: string,
  projectRoot: string,
  customConfig?: SecurityConfig
): void {
  const config = customConfig || serverConfig.getConfig().security;

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedTarget = path.resolve(projectRoot, filePath);

  const normRoot = normalizeCase(resolvedRoot);
  const normTarget = normalizeCase(resolvedTarget);

  // 1. Path traversal check (must reside within projectRoot)
  const isInside =
    normTarget === normRoot ||
    normTarget.startsWith(normRoot + path.sep);

  if (!isInside) {
    throw new SecurityError(`Access denied: Path '${filePath}' escapes project root boundary`, {
      filePath,
      projectRoot: resolvedRoot,
    });
  }

  // 2. Check excluded directories in path components
  const relativeParts = path.relative(resolvedRoot, resolvedTarget).split(path.sep);
  for (const part of relativeParts) {
    for (const excluded of config.excluded_dirs) {
      if (normalizeCase(part) === normalizeCase(excluded)) {
        throw new SecurityError(`Access denied: Path contains excluded directory '${part}'`, {
          filePath,
          excludedDirectory: part,
        });
      }
    }
  }

  // 3. Extension filtering (if configured)
  if (config.allowed_extensions && config.allowed_extensions.length > 0) {
    const ext = path.extname(resolvedTarget).replace(/^\./, '').toLowerCase();
    const isAllowed = config.allowed_extensions.some((allowed) => allowed.toLowerCase() === ext);
    if (!isAllowed) {
      throw new SecurityError(`Access denied: Extension '.${ext}' is not in allowed extensions list`, {
        filePath,
        extension: ext,
        allowedExtensions: config.allowed_extensions,
      });
    }
  }

  // 4. File size limit check (if file exists on disk)
  try {
    if (fs.existsSync(resolvedTarget)) {
      const stats = fs.statSync(resolvedTarget);
      if (stats.isFile()) {
        const maxBytes = config.max_file_size_mb * 1024 * 1024;
        if (stats.size > maxBytes) {
          throw new SecurityError(
            `File size (${(stats.size / (1024 * 1024)).toFixed(2)} MB) exceeds allowed limit of ${config.max_file_size_mb} MB`,
            {
              filePath,
              sizeBytes: stats.size,
              maxBytes,
            }
          );
        }
      }
    }
  } catch (err) {
    if (err instanceof SecurityError) throw err;
    // Non-existent in memory file is allowed; disk access errors ignored here
  }
}
