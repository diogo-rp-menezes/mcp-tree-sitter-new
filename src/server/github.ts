import { detectLanguage } from './parser';

export interface GitHubRepoDetails {
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string;
  stars: number;
}

export interface ImportedGitHubFile {
  path: string;
  content: string;
  language: string;
  size: number;
}

export interface GitHubImportResult {
  repo: GitHubRepoDetails;
  branch: string;
  files: ImportedGitHubFile[];
  totalDiscovered: number;
  totalImported: number;
  detectedLanguages: string[];
}

export interface GitHubImportOptions {
  repoUrl: string;
  branch?: string;
  subpath?: string;
  token?: string;
  maxFiles?: number; // 0 or undefined means unlimited (no restriction)
  batchSize?: number; // streaming buffer flush threshold (default 25)
  concurrency?: number; // concurrent download requests (default 12)
  onBatch?: (batch: ImportedGitHubFile[], progress: { processed: number; total: number }) => Promise<void> | void;
}

const ALLOWED_EXTS = new Set([
  '.py', '.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
  '.json', '.yaml', '.yml', '.toml', '.md', '.sql', '.html', '.css'
]);

const IGNORED_PATHS = [
  'node_modules/',
  '.git/',
  'dist/',
  'build/',
  '.next/',
  '.venv/',
  'venv/',
  '__pycache__/',
  '.turbo/',
  '.cache/',
  'coverage/',
  '.github/',
];

/**
 * Parses various GitHub URL formats or "owner/repo" shorthand.
 */
export function parseGitHubRepo(input: string): { owner: string; repo: string } | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();

  // Pattern for git@github.com:owner/repo(.git)
  const sshMatch = trimmed.match(/^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?$/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // Pattern for https?://(www.)?github.com/owner/repo
  const urlMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git|\/.*)?$/);
  if (urlMatch) {
    return { owner: urlMatch[1], repo: urlMatch[2] };
  }

  // Pattern for "owner/repo" shorthand
  const shortMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}

/**
 * Fetches repository metadata from GitHub REST API.
 */
export async function fetchGitHubRepoDetails(
  owner: string,
  repo: string,
  token?: string
): Promise<GitHubRepoDetails> {
  const headers: Record<string, string> = {
    'User-Agent': 'AIStudio-TreeSitter-MCP',
    Accept: 'application/vnd.github.v3+json',
  };
  if (token) {
    headers['Authorization'] = `token ${token.trim()}`;
  }

  const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
    headers,
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Repositório '${owner}/${repo}' não encontrado no GitHub. Verifique a URL ou forneça um token caso seja privado.`);
    }
    if (res.status === 403) {
      const rateLimitMsg = res.headers.get('x-ratelimit-remaining') === '0'
        ? 'Limite de requisições da API do GitHub excedido. Forneça um Personal Access Token para continuar.'
        : 'Acesso negado pela API do GitHub.';
      throw new Error(rateLimitMsg);
    }
    throw new Error(`Erro ao consultar GitHub API: HTTP ${res.status}`);
  }

  const data = await res.json();
  return {
    owner: data.owner?.login || owner,
    repo: data.name || repo,
    defaultBranch: data.default_branch || 'main',
    description: data.description || '',
    stars: data.stargazers_count || 0,
  };
}

/**
 * Streaming Async Generator: Fetches files in buffered batches without arbitrary file count restrictions.
 * Implements a streaming buffer queue to process large repositories efficiently without high memory pressure.
 */
export async function* streamGitHubRepository(options: GitHubImportOptions): AsyncGenerator<{
  batch: ImportedGitHubFile[];
  processed: number;
  total: number;
  repo: GitHubRepoDetails;
  branch: string;
}> {
  const parsed = parseGitHubRepo(options.repoUrl);
  if (!parsed) {
    throw new Error('URL ou formato de repositório inválido. Utilize "owner/repo" ou "https://github.com/owner/repo".');
  }

  const details = await fetchGitHubRepoDetails(parsed.owner, parsed.repo, options.token);
  const targetBranch = options.branch?.trim() || details.defaultBranch;

  const headers: Record<string, string> = {
    'User-Agent': 'AIStudio-TreeSitter-MCP',
    Accept: 'application/vnd.github.v3+json',
  };
  if (options.token) {
    headers['Authorization'] = `token ${options.token.trim()}`;
  }

  // Fetch full recursive file tree from GitHub Git Trees API
  const treeUrl = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/git/trees/${encodeURIComponent(targetBranch)}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers });

  if (!treeRes.ok) {
    throw new Error(`Não foi possível obter a árvore de arquivos para a branch '${targetBranch}'. Verifique se o branch existe.`);
  }

  const treeData = await treeRes.json();
  const rawTree: Array<{ path: string; mode: string; type: string; sha: string; size?: number }> = treeData.tree || [];

  const subpathFilter = options.subpath?.trim().replace(/^\/+|\/+$/g, '') || '';

  // Filter to valid code files without arbitrary count limits
  const candidateFiles = rawTree.filter((item) => {
    if (item.type !== 'blob') return false;
    if (subpathFilter && !item.path.startsWith(`${subpathFilter}/`) && item.path !== subpathFilter) {
      return false;
    }
    // Check ignored folders
    if (IGNORED_PATHS.some((ign) => item.path.includes(ign))) {
      return false;
    }
    // Exclude large binary/asset files (> 1MB)
    if (item.size && item.size > 1024 * 1024) {
      return false;
    }
    const extMatch = item.path.match(/\.[a-zA-Z0-9]+$/);
    if (!extMatch) return false;
    return ALLOWED_EXTS.has(extMatch[0].toLowerCase());
  });

  // If user specified an explicit non-zero maxFiles, respect it; otherwise import everything discovered
  const targetFiles = options.maxFiles && options.maxFiles > 0
    ? candidateFiles.slice(0, options.maxFiles)
    : candidateFiles;

  const total = targetFiles.length;
  if (total === 0) {
    throw new Error('Nenhum arquivo de código suportado foi encontrado no repositório com os filtros informados.');
  }

  const concurrency = Math.min(Math.max(1, options.concurrency || 12), 30);
  const bufferLimit = Math.min(Math.max(1, options.batchSize || 25), 100);

  let streamBuffer: ImportedGitHubFile[] = [];
  let processed = 0;

  // Process files in controlled concurrent worker chunks
  for (let i = 0; i < total; i += concurrency) {
    const chunk = targetFiles.slice(i, i + concurrency);
    const downloaded = await Promise.all(
      chunk.map(async (item) => {
        try {
          const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}/${encodeURIComponent(targetBranch)}/${item.path}`;
          const rawRes = await fetch(rawUrl, {
            headers: options.token ? { Authorization: `token ${options.token.trim()}` } : {},
          });

          if (!rawRes.ok) return null;
          const content = await rawRes.text();

          const relativePath = subpathFilter && item.path.startsWith(`${subpathFilter}/`)
            ? item.path.slice(subpathFilter.length + 1)
            : item.path;

          const lang = detectLanguage(relativePath);

          return {
            path: relativePath,
            content,
            language: lang,
            size: Buffer.byteLength(content, 'utf-8'),
          };
        } catch {
          return null;
        }
      })
    );

    for (const file of downloaded) {
      if (file && file.content.length > 0) {
        streamBuffer.push(file);
      }
    }
    processed += chunk.length;

    // Flush buffer when threshold reached
    if (streamBuffer.length >= bufferLimit) {
      const batchToYield = [...streamBuffer];
      streamBuffer = [];
      yield {
        batch: batchToYield,
        processed,
        total,
        repo: details,
        branch: targetBranch,
      };
    }
  }

  // Flush any remaining files in buffer
  if (streamBuffer.length > 0) {
    yield {
      batch: streamBuffer,
      processed: total,
      total,
      repo: details,
      branch: targetBranch,
    };
  }
}

/**
 * High-level import that utilizes the streaming buffer system.
 * Removes the arbitrary 80-file restriction, supporting full repository imports.
 */
export async function importGitHubRepository(options: GitHubImportOptions): Promise<GitHubImportResult> {
  const allFiles: ImportedGitHubFile[] = [];
  const detectedLanguages = new Set<string>();
  let repoDetails: GitHubRepoDetails | null = null;
  let targetBranch = '';
  let totalDiscovered = 0;

  for await (const chunk of streamGitHubRepository(options)) {
    repoDetails = chunk.repo;
    targetBranch = chunk.branch;
    totalDiscovered = chunk.total;

    for (const file of chunk.batch) {
      allFiles.push(file);
      detectedLanguages.add(file.language);
    }

    if (options.onBatch) {
      await options.onBatch(chunk.batch, { processed: chunk.processed, total: chunk.total });
    }
  }

  if (!repoDetails || allFiles.length === 0) {
    throw new Error('Nenhum arquivo de código foi importado do repositório.');
  }

  return {
    repo: repoDetails,
    branch: targetBranch,
    files: allFiles,
    totalDiscovered,
    totalImported: allFiles.length,
    detectedLanguages: Array.from(detectedLanguages),
  };
}
