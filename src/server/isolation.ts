import path from 'path';
import { Project } from './types';

export class ProjectIsolationError extends Error {
  public code = 'PROJECT_ISOLATION_VIOLATION';
  public projectName: string;
  public projectRoot: string;
  public attemptedPath: string;

  constructor(projectName: string, projectRoot: string, attemptedPath: string, message: string) {
    super(`[Project Isolation Violation] Project '${projectName}' (${projectRoot}): ${message} - '${attemptedPath}'`);
    this.name = 'ProjectIsolationError';
    this.projectName = projectName;
    this.projectRoot = projectRoot;
    this.attemptedPath = attemptedPath;
  }
}

/**
 * Standardize path representation, removing trailing slashes and normalizing separators.
 */
export function normalizePath(p: string): string {
  if (!p) return '/';
  let normalized = path.posix.normalize(p.replace(/\\/g, '/'));
  if (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Validates that a requested file path belongs strictly inside the project root path.
 * Protects against:
 * 1. Path traversal attacks (`../`, `../../etc/passwd`)
 * 2. Absolute paths belonging to other project roots (cross-contamination)
 * 3. Null bytes or invalid characters
 */
export function validateAndResolvePath(
  project: Project,
  requestedFilePath: string
): { relativePath: string; absolutePath: string } {
  if (!requestedFilePath || typeof requestedFilePath !== 'string') {
    throw new ProjectIsolationError(
      project.name,
      project.path,
      String(requestedFilePath),
      'File path must be a non-empty string'
    );
  }

  // Check for forbidden null byte
  if (requestedFilePath.includes('\0')) {
    throw new ProjectIsolationError(
      project.name,
      project.path,
      requestedFilePath,
      'Path contains forbidden null bytes'
    );
  }

  const projectRoot = normalizePath(project.path);
  const normalizedRequested = normalizePath(requestedFilePath);

  let absoluteCandidate: string;
  let relativeCandidate: string;

  if (path.posix.isAbsolute(normalizedRequested)) {
    // If an absolute path is provided:
    // It MUST be located strictly inside the project root directory
    if (
      normalizedRequested !== projectRoot &&
      !normalizedRequested.startsWith(`${projectRoot}/`)
    ) {
      throw new ProjectIsolationError(
        project.name,
        projectRoot,
        requestedFilePath,
        `Cross-project boundary violation: Absolute path does not belong to project workspace root '${projectRoot}'`
      );
    }
    absoluteCandidate = normalizedRequested;
    relativeCandidate = normalizedRequested.slice(projectRoot.length).replace(/^\/+/, '');
  } else {
    // Relative path provided:
    // Resolve relative to project root and verify it does not escape via `..`
    const resolved = path.posix.resolve(projectRoot, normalizedRequested);
    if (resolved !== projectRoot && !resolved.startsWith(`${projectRoot}/`)) {
      throw new ProjectIsolationError(
        project.name,
        projectRoot,
        requestedFilePath,
        `Path traversal violation: Relative path escapes project workspace root '${projectRoot}'`
      );
    }
    absoluteCandidate = resolved;
    relativeCandidate = resolved.slice(projectRoot.length).replace(/^\/+/, '');
  }

  if (!relativeCandidate) {
    throw new ProjectIsolationError(
      project.name,
      projectRoot,
      requestedFilePath,
      'Target path points to the project root directory itself instead of a project file'
    );
  }

  return {
    relativePath: relativeCandidate,
    absolutePath: absoluteCandidate,
  };
}

export interface ProjectIsolationReport {
  projectName: string;
  projectRoot: string;
  isIsolated: boolean;
  totalFiles: number;
  files: Array<{ relativePath: string; absolutePath: string; isCompliant: boolean }>;
  violationCount: number;
}

/**
 * Audits all files registered in a project to verify 100% boundary isolation compliance.
 */
export function auditProjectIsolation(project: Project): ProjectIsolationReport {
  const projectRoot = normalizePath(project.path);
  const fileEntries = Array.from(project.files.keys());
  const auditFiles: Array<{ relativePath: string; absolutePath: string; isCompliant: boolean }> = [];
  let violations = 0;

  for (const f of fileEntries) {
    try {
      const { relativePath, absolutePath } = validateAndResolvePath(project, f);
      auditFiles.push({ relativePath, absolutePath, isCompliant: true });
    } catch {
      violations++;
      auditFiles.push({
        relativePath: f,
        absolutePath: `${projectRoot}/${f}`,
        isCompliant: false,
      });
    }
  }

  return {
    projectName: project.name,
    projectRoot,
    isIsolated: violations === 0,
    totalFiles: fileEntries.length,
    files: auditFiles,
    violationCount: violations,
  };
}
