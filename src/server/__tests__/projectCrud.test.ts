import { describe, it, expect } from 'vitest';
import { projectStore } from '../store';

describe('Project CRUD and Clone Operations', () => {
  it('performs full CRUD lifecycle: Create, Read, Update, Rename, Clone, and Delete', () => {
    // 1. Create
    const projName = 'crud-test-service';
    const created = projectStore.createProject(
      projName,
      '/projects/crud-test-service',
      'Test service for CRUD operations'
    );
    expect(created.name).toBe(projName);
    expect(created.path).toBe('/projects/crud-test-service');

    // Add files to the project
    projectStore.saveFile(projName, 'src/main.py', 'def test(): pass\n');
    projectStore.saveFile(projName, 'config.json', '{"debug": true}\n');

    // 2. Read
    const retrieved = projectStore.getProject(projName);
    expect(retrieved).toBeDefined();
    expect(retrieved?.files.size).toBe(2);

    const fileList = projectStore.listFiles(projName);
    expect(fileList).toContain('src/main.py');
    expect(fileList).toContain('config.json');

    // 3. Update (metadata only)
    const updatedMeta = projectStore.updateProject(projName, {
      description: 'Updated description for test service',
    });
    expect(updatedMeta.description).toBe('Updated description for test service');
    expect(projectStore.getProject(projName)?.description).toBe('Updated description for test service');

    // 4. Update (Renaming project)
    const renamedName = 'crud-renamed-service';
    const renamed = projectStore.updateProject(projName, {
      name: renamedName,
      path: '/projects/crud-renamed-service',
      description: 'Renamed service',
    });
    expect(renamed.name).toBe(renamedName);
    expect(projectStore.getProject(projName)).toBeUndefined();
    expect(projectStore.getProject(renamedName)).toBeDefined();
    expect(projectStore.getProject(renamedName)?.files.size).toBe(2);

    // 5. Clone
    const cloneName = 'crud-cloned-service';
    const cloned = projectStore.cloneProject(
      renamedName,
      cloneName,
      '/projects/crud-cloned-service',
      'Cloned test service'
    );
    expect(cloned.name).toBe(cloneName);
    expect(cloned.files.size).toBe(2);
    expect(cloned.files.has('src/main.py')).toBe(true);
    expect(cloned.files.get('src/main.py')?.content).toBe('def test(): pass\n');

    // 6. Delete
    const deletedOriginal = projectStore.removeProject(renamedName);
    expect(deletedOriginal).toBe(true);
    expect(projectStore.getProject(renamedName)).toBeUndefined();

    const deletedClone = projectStore.removeProject(cloneName);
    expect(deletedClone).toBe(true);
    expect(projectStore.getProject(cloneName)).toBeUndefined();
  });
});
