import { describe, it, expect } from 'vitest';
import { normalizePath, validateAndResolvePath, ProjectIsolationError } from '../isolation';
import { Project } from '../types';

describe('Project Isolation & Path Security', () => {
  const dummyProject: Project = {
    name: 'test-project',
    path: '/workspace/test-project',
    description: 'Isolation test sandbox',
    files: new Map(),
  };

  it('normalizes paths removing trailing slashes and converting backslashes', () => {
    expect(normalizePath('src\\components\\')).toBe('src/components');
    expect(normalizePath('/workspace/test///')).toBe('/workspace/test');
    expect(normalizePath('')).toBe('/');
  });

  it('allows valid relative file paths inside project root', () => {
    const res = validateAndResolvePath(dummyProject, 'src/main.py');
    expect(res.relativePath).toBe('src/main.py');
    expect(res.absolutePath).toBe('/workspace/test-project/src/main.py');
  });

  it('allows valid absolute file paths strictly inside project root', () => {
    const res = validateAndResolvePath(dummyProject, '/workspace/test-project/src/index.ts');
    expect(res.relativePath).toBe('src/index.ts');
    expect(res.absolutePath).toBe('/workspace/test-project/src/index.ts');
  });

  it('blocks path traversal attempts escaping the project root', () => {
    expect(() => {
      validateAndResolvePath(dummyProject, '../escape.py');
    }).toThrow(ProjectIsolationError);

    expect(() => {
      validateAndResolvePath(dummyProject, '../../etc/passwd');
    }).toThrow(ProjectIsolationError);
  });

  it('blocks cross-project absolute paths escaping root', () => {
    expect(() => {
      validateAndResolvePath(dummyProject, '/workspace/other-project/secret.key');
    }).toThrow(ProjectIsolationError);
  });

  it('blocks null bytes in file paths', () => {
    expect(() => {
      validateAndResolvePath(dummyProject, 'src/file.py\0.txt');
    }).toThrow(ProjectIsolationError);
  });
});
