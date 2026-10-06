import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export interface GitCommitInfo {
  hash: string;
  author: string;
  relativeDate: string;
  date: string;
  message: string;
}

export interface GitRepoStatus {
  isGitRepo: boolean;
  branch: string | null;
  uncommittedCount: number;
  stagedCount: number;
  modifiedCount: number;
  untrackedCount: number;
  lastCommit: GitCommitInfo | null;
  remoteUrl: string | null;
  statusText: string;
  repoPath: string;
}

/**
 * Checks the Git status of a project path safely using execFileSync without shell interpolation.
 */
export function getProjectGitStatus(projectPath: string): GitRepoStatus {
  const normalizedPath = path.resolve(projectPath);

  // If the path doesn't exist on disk, check if it's within the main workspace root
  let targetPath = normalizedPath;
  if (!fs.existsSync(targetPath)) {
    // If the project path is virtual like /projects/tree-sitter-core, fallback to workspace root
    if (fs.existsSync('/workspace')) {
      targetPath = '/workspace';
    } else if (fs.existsSync(process.cwd())) {
      targetPath = process.cwd();
    } else {
      return {
        isGitRepo: false,
        branch: null,
        uncommittedCount: 0,
        stagedCount: 0,
        modifiedCount: 0,
        untrackedCount: 0,
        lastCommit: null,
        remoteUrl: null,
        statusText: `Diretório '${projectPath}' não encontrado no disco local`,
        repoPath: projectPath,
      };
    }
  }

  // Check if targetPath is inside a git working tree
  try {
    const isInside = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: targetPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (isInside !== 'true') {
      return {
        isGitRepo: false,
        branch: null,
        uncommittedCount: 0,
        stagedCount: 0,
        modifiedCount: 0,
        untrackedCount: 0,
        lastCommit: null,
        remoteUrl: null,
        statusText: 'Não é um repositório Git',
        repoPath: targetPath,
      };
    }

    // Branch name
    let branch = 'main';
    try {
      branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: targetPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      branch = 'HEAD';
    }

    // Status / Uncommitted files
    let stagedCount = 0;
    let modifiedCount = 0;
    let untrackedCount = 0;
    let uncommittedCount = 0;

    try {
      const statusOutput = execFileSync('git', ['status', '--porcelain'], {
        cwd: targetPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      const lines = statusOutput.split('\n').filter((l) => l.trim().length > 0);
      uncommittedCount = lines.length;

      for (const line of lines) {
        const x = line.charAt(0);
        const y = line.charAt(1);

        if (x === '?' && y === '?') {
          untrackedCount++;
        } else {
          if (x !== ' ' && x !== '?') stagedCount++;
          if (y !== ' ' && y !== '?') modifiedCount++;
        }
      }
    } catch {
      // ignore status read errors
    }

    // Last commit details
    let lastCommit: GitCommitInfo | null = null;
    try {
      const logOutput = execFileSync('git', ['log', '-1', '--pretty=format:%h|%an|%ar|%s|%ci'], {
        cwd: targetPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();

      if (logOutput) {
        const [hash, author, relativeDate, message, date] = logOutput.split('|');
        lastCommit = {
          hash: hash || '0000000',
          author: author || 'Autor',
          relativeDate: relativeDate || 'recentemente',
          message: message || 'Nenhum commit',
          date: date || new Date().toISOString(),
        };
      }
    } catch {
      // Empty repository without commits
    }

    // Remote URL
    let remoteUrl: string | null = null;
    try {
      remoteUrl = execFileSync('git', ['remote', 'get-url', 'origin'], {
        cwd: targetPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      remoteUrl = null;
    }

    const statusText =
      uncommittedCount === 0
        ? 'Working tree limpa (nenhuma alteração pendente)'
        : `${uncommittedCount} arquivo(s) com alterações pendentes (${stagedCount} staged, ${modifiedCount} modificados, ${untrackedCount} untracked)`;

    return {
      isGitRepo: true,
      branch,
      uncommittedCount,
      stagedCount,
      modifiedCount,
      untrackedCount,
      lastCommit,
      remoteUrl,
      statusText,
      repoPath: targetPath,
    };
  } catch {
    return {
      isGitRepo: false,
      branch: null,
      uncommittedCount: 0,
      stagedCount: 0,
      modifiedCount: 0,
      untrackedCount: 0,
      lastCommit: null,
      remoteUrl: null,
      statusText: 'Git não configurado ou pasta inacessível',
      repoPath: targetPath,
    };
  }
}

/**
 * Initializes a new Git repository safely without shell interpolation.
 */
export function initProjectGitRepo(projectPath: string, branchName = 'main'): GitRepoStatus {
  const normalizedPath = path.resolve(projectPath);
  const appRoot = path.resolve(process.cwd());
  const workspaceRoot = fs.existsSync('/workspace') ? path.resolve('/workspace') : appRoot;

  // Enforce boundary: project path must be strictly inside appRoot or workspaceRoot
  const isWithinApp = normalizedPath === appRoot || normalizedPath.startsWith(`${appRoot}${path.sep}`);
  const isWithinWorkspace = normalizedPath === workspaceRoot || normalizedPath.startsWith(`${workspaceRoot}${path.sep}`);

  if (!isWithinApp && !isWithinWorkspace) {
    throw new Error(`Permissão negada: o caminho '${projectPath}' está fora do workspace permitido.`);
  }

  if (!fs.existsSync(normalizedPath)) {
    fs.mkdirSync(normalizedPath, { recursive: true });
  }

  // Validate branch name against safe pattern
  const safeBranch = /^[a-zA-Z0-9._-]+$/.test(branchName) ? branchName : 'main';

  execFileSync('git', ['init', '-b', safeBranch], { cwd: normalizedPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'AI Studio'], { cwd: normalizedPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'dev@aistudio.local'], { cwd: normalizedPath, stdio: 'ignore' });

  return getProjectGitStatus(normalizedPath);
}

/**
 * Materializes and syncs files from SQLite store into the project disk directory.
 */
export function syncProjectFilesToDisk(
  projectPath: string,
  files: Array<{ path: string; content: string }>
): { syncedCount: number; targetPath: string } {
  const normalizedPath = path.resolve(projectPath);

  if (!fs.existsSync(normalizedPath)) {
    fs.mkdirSync(normalizedPath, { recursive: true });
  }

  let syncedCount = 0;
  for (const f of files) {
    const fullFilePath = path.join(normalizedPath, f.path);
    const dir = path.dirname(fullFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullFilePath, f.content, 'utf-8');
    syncedCount++;
  }

  return { syncedCount, targetPath: normalizedPath };
}

/**
 * Stages files for Git commit.
 */
export function stageGitFiles(projectPath: string, filePaths?: string[]): GitRepoStatus {
  const normalizedPath = path.resolve(projectPath);
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Diretório '${projectPath}' não existe no disco.`);
  }

  if (filePaths && filePaths.length > 0) {
    for (const fp of filePaths) {
      execFileSync('git', ['add', fp], { cwd: normalizedPath, stdio: 'ignore' });
    }
  } else {
    execFileSync('git', ['add', '-A'], { cwd: normalizedPath, stdio: 'ignore' });
  }

  return getProjectGitStatus(normalizedPath);
}

/**
 * Unstages files from Git staging area.
 */
export function unstageGitFiles(projectPath: string, filePaths?: string[]): GitRepoStatus {
  const normalizedPath = path.resolve(projectPath);
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Diretório '${projectPath}' não existe no disco.`);
  }

  if (filePaths && filePaths.length > 0) {
    for (const fp of filePaths) {
      execFileSync('git', ['restore', '--staged', fp], { cwd: normalizedPath, stdio: 'ignore' });
    }
  } else {
    try {
      execFileSync('git', ['restore', '--staged', '.'], { cwd: normalizedPath, stdio: 'ignore' });
    } catch {
      execFileSync('git', ['reset'], { cwd: normalizedPath, stdio: 'ignore' });
    }
  }

  return getProjectGitStatus(normalizedPath);
}

/**
 * Creates a Git commit.
 */
export function commitGitChanges(projectPath: string, message: string): GitRepoStatus {
  const normalizedPath = path.resolve(projectPath);
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Diretório '${projectPath}' não existe no disco.`);
  }

  const cleanMessage = message.trim();
  if (!cleanMessage) {
    throw new Error('A mensagem de commit não pode estar vazia.');
  }

  // Ensure git user identity
  try {
    execFileSync('git', ['config', 'user.name', 'AI Studio'], { cwd: normalizedPath, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'dev@aistudio.local'], { cwd: normalizedPath, stdio: 'ignore' });
  } catch {
    // ignore
  }

  execFileSync('git', ['commit', '-m', cleanMessage], { cwd: normalizedPath, stdio: 'ignore' });
  return getProjectGitStatus(normalizedPath);
}

/**
 * Switches or creates a Git branch.
 */
export function switchGitBranch(projectPath: string, branchName: string, createNew = false): GitRepoStatus {
  const normalizedPath = path.resolve(projectPath);
  if (!fs.existsSync(normalizedPath)) {
    throw new Error(`Diretório '${projectPath}' não existe no disco.`);
  }

  const safeBranch = branchName.trim();
  if (!/^[a-zA-Z0-9._/-]+$/.test(safeBranch)) {
    throw new Error(`Nome de branch inválido: '${branchName}'.`);
  }

  if (createNew) {
    execFileSync('git', ['checkout', '-b', safeBranch], { cwd: normalizedPath, stdio: 'ignore' });
  } else {
    execFileSync('git', ['checkout', safeBranch], { cwd: normalizedPath, stdio: 'ignore' });
  }

  return getProjectGitStatus(normalizedPath);
}
