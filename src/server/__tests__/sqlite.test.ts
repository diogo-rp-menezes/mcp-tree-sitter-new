import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteWorkspaceStorage } from '../db';

describe('SQLite Workspace Storage', () => {
  let db: SQLiteWorkspaceStorage;

  beforeEach(() => {
    // In-memory SQLite database for isolated testing
    db = new SQLiteWorkspaceStorage(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('initializes schema and loads empty projects list', () => {
    const projects = db.loadAllProjects();
    expect(projects.size).toBe(0);
  });

  it('saves and retrieves a project', () => {
    db.saveProject('my-service', '/workspace/my-service', 'Test service');
    const projects = db.loadAllProjects();

    expect(projects.has('my-service')).toBe(true);
    const p = projects.get('my-service');
    expect(p?.name).toBe('my-service');
    expect(p?.path).toBe('/workspace/my-service');
    expect(p?.description).toBe('Test service');
    expect(p?.files.size).toBe(0);
  });

  it('persists single files and batch files with atomic transactions', () => {
    db.saveProject('web-app', '/workspace/web-app', 'Web app');

    // Single file
    db.saveFile('web-app', 'index.ts', 'typescript', 'console.log("hello");', 22);

    // Batch files
    db.saveFilesBatch('web-app', [
      { path: 'src/app.ts', language: 'typescript', content: 'export const app = {};', sizeBytes: 21 },
      { path: 'src/utils.py', language: 'python', content: 'def helper(): pass', sizeBytes: 18 },
    ]);

    const projects = db.loadAllProjects();
    const p = projects.get('web-app');
    expect(p).toBeDefined();
    expect(p?.files.size).toBe(3);

    const indexFile = p?.files.get('index.ts');
    expect(indexFile?.language).toBe('typescript');
    expect(indexFile?.content).toBe('console.log("hello");');
    expect(indexFile?.lastModified).toBeDefined();

    const utilsFile = p?.files.get('src/utils.py');
    expect(utilsFile?.language).toBe('python');
  });

  it('deletes specific files and cascades on project deletion', () => {
    db.saveProject('temp-proj', '/workspace/temp-proj', 'Temp');
    db.saveFile('temp-proj', 'test.py', 'python', 'x = 1', 5);
    db.saveFile('temp-proj', 'other.py', 'python', 'y = 2', 5);

    // Delete single file
    const deletedFile = db.deleteFile('temp-proj', 'test.py');
    expect(deletedFile).toBe(true);

    let projects = db.loadAllProjects();
    expect(projects.get('temp-proj')?.files.size).toBe(1);

    // Delete project (cascade)
    const deletedProj = db.deleteProject('temp-proj');
    expect(deletedProj).toBe(true);

    projects = db.loadAllProjects();
    expect(projects.has('temp-proj')).toBe(false);
  });

  it('introspects database schema and table definitions accurately', () => {
    db.saveProject('demo', '/workspace/demo', 'Demo');
    db.saveFile('demo', 'main.go', 'go', 'package main', 12);

    const schema = db.getDatabaseSchema();
    expect(schema.length).toBeGreaterThanOrEqual(2);

    const projectsTable = schema.find((t) => t.name === 'projects');
    expect(projectsTable).toBeDefined();
    expect(projectsTable?.rowCount).toBe(1);
    expect(projectsTable?.columns.some((c) => c.name === 'name' && c.pk)).toBe(true);

    const filesTable = schema.find((t) => t.name === 'files');
    expect(filesTable).toBeDefined();
    expect(filesTable?.rowCount).toBe(1);
    expect(filesTable?.columns.some((c) => c.name === 'project_name')).toBe(true);
  });

  it('fetches paginated records and protects against invalid table names', () => {
    db.saveProject('p1', '/workspace/p1', 'P1');
    db.saveProject('p2', '/workspace/p2', 'P2');

    const records = db.getTableRecords('projects', 1, 0);
    expect(records.total).toBe(2);
    expect(records.rows.length).toBe(1);
    expect(records.columns).toContain('name');

    expect(() => db.getTableRecords('non_existent_table')).toThrow();
  });

  it('executes ad-hoc read and write SQL queries with duration metrics', () => {
    db.saveProject('audit-proj', '/workspace/audit-proj', 'Auditing');

    // SELECT query
    const selectRes = db.executeRawQuery("SELECT name, path FROM projects WHERE name = 'audit-proj'");
    expect(selectRes.isReadonly).toBe(true);
    expect(selectRes.rowCount).toBe(1);
    expect(selectRes.rows[0].name).toBe('audit-proj');
    expect(selectRes.columns).toEqual(['name', 'path']);
    expect(typeof selectRes.durationMs).toBe('number');

    // DML write query
    const insertRes = db.executeRawQuery(
      "INSERT INTO projects (name, path, description) VALUES ('manual-proj', '/workspace/manual', 'Added via SQL')"
    );
    expect(insertRes.isReadonly).toBe(false);
    expect(insertRes.rowCount).toBe(1);
    expect(insertRes.changes).toBe(1);

    // Verify written record exists
    const checkRes = db.executeRawQuery("SELECT count(*) as total FROM projects WHERE name = 'manual-proj'");
    expect(checkRes.rows[0].total).toBe(1);
  });
});
