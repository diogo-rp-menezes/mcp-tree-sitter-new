/**
 * AST/Tree-sitter Language-Agnostic Specification - Section 3
 * Language Registry Interface & Accurate Extension Mapping
 */

import path from 'path';
import Parser from 'web-tree-sitter';
import {
  getTreeSitterLanguage,
  initTreeSitter,
  LANGUAGE_TO_WASM_MAP,
  isTreeSitterLanguageSupported,
} from './treeSitter';
import { LanguageNotFoundError } from './errors';

export interface InstallableLanguage {
  identifier: string;
  displayName: string;
}

export class LanguageRegistry {
  private parserCache = new Map<string, Parser>();

  /**
   * Verified extension to grammar mapping with real WebAssembly binaries.
   * TSX is explicitly mapped to 'tsx' to prevent syntax corruption.
   */
  public static readonly EXTENSION_MAP: Record<string, string> = {
    '.py': 'python',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.ts': 'typescript',
    '.mts': 'typescript',
    '.cts': 'typescript',
    '.tsx': 'tsx',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.hpp': 'cpp',
    '.hh': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.rb': 'ruby',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.kts': 'kotlin',
    '.scala': 'scala',
    '.lua': 'lua',
    '.sh': 'bash',
    '.bash': 'bash',
    '.zsh': 'bash',
    '.json': 'json',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.scss': 'css',
    '.less': 'css',
    '.toml': 'toml',
    '.vue': 'vue',
    '.zig': 'zig',
    '.ml': 'ocaml',
    '.res': 'rescript',
    '.resi': 'rescript',
    '.ex': 'elixir',
    '.exs': 'elixir',
    '.el': 'elisp',
    '.sol': 'solidity',
    '.m': 'objc',
    '.mm': 'objc',
  };

  /**
   * Display names for available languages with verified WASM files.
   */
  public static readonly DISPLAY_NAMES: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    tsx: 'TypeScript JSX (TSX)',
    rust: 'Rust',
    go: 'Go',
    c: 'C',
    cpp: 'C++',
    csharp: 'C#',
    java: 'Java',
    ruby: 'Ruby',
    php: 'PHP',
    swift: 'Swift',
    kotlin: 'Kotlin',
    scala: 'Scala',
    lua: 'Lua',
    bash: 'Bash / Shell',
    json: 'JSON',
    html: 'HTML',
    css: 'CSS',
    toml: 'TOML',
    vue: 'Vue',
    zig: 'Zig',
    ocaml: 'OCaml',
    rescript: 'ReScript',
    elixir: 'Elixir',
    elisp: 'Emacs Lisp',
    solidity: 'Solidity',
    objc: 'Objective-C',
  };

  /**
   * Maps a file path or extension to its tree-sitter language grammar identifier.
   */
  public languageForFile(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    if (ext && LanguageRegistry.EXTENSION_MAP[ext]) {
      return LanguageRegistry.EXTENSION_MAP[ext];
    }
    const basename = path.basename(filePath).toLowerCase();
    if (basename === 'package.json' || basename === 'tsconfig.json') return 'json';
    if (basename === 'cargo.toml') return 'toml';
    if (basename === 'dockerfile') return null;
    return null;
  }

  /**
   * Resolves language for a file path or throws LanguageNotFoundError if not recognized/supported.
   */
  public resolveFileLanguageOrThrow(filePath: string, explicitLanguage?: string | null): string {
    const lang = explicitLanguage || this.languageForFile(filePath);
    if (!lang) {
      throw new LanguageNotFoundError(filePath, {
        filePath,
        message: `No supported tree-sitter language grammar found for file '${filePath}'.`,
      });
    }
    return this.resolveLanguageOrThrow(lang);
  }

  /**
   * Resolves language name, throws LanguageNotFoundError if grammar not supported.
   */
  public resolveLanguageOrThrow(language: string): string {
    const canonical = this.canonicalLanguageName(language);
    if (!this.isLanguageAvailable(canonical)) {
      throw new LanguageNotFoundError(language, {
        language,
        message: `Language '${language}' is not recognized or available in tree-sitter pack.`,
      });
    }
    return canonical;
  }

  /**
   * Retrieves tree-sitter Language instance.
   */
  public async getLanguage(languageName: string): Promise<Parser.Language | null> {
    const canonical = this.canonicalLanguageName(languageName);
    return await getTreeSitterLanguage(canonical);
  }

  /**
   * Returns a reusable Parser instance for the language.
   */
  public async getParser(languageName: string): Promise<Parser | null> {
    const canonical = this.canonicalLanguageName(languageName);
    const lang = await this.getLanguage(canonical);
    if (!lang) return null;

    if (!this.parserCache.has(canonical)) {
      const parser = new Parser();
      parser.setLanguage(lang);
      this.parserCache.set(canonical, parser);
    }

    return this.parserCache.get(canonical)!;
  }

  /**
   * Preloads the given language grammars.
   */
  public async preloadLanguages(languageNames: string[]): Promise<void> {
    await initTreeSitter();
    await Promise.all(languageNames.map((name) => this.getLanguage(name)));
  }

  /**
   * Lists all available language identifiers with verified .wasm files.
   */
  public listAvailableLanguages(): string[] {
    const available = new Set<string>();
    for (const lang of Object.values(LanguageRegistry.EXTENSION_MAP)) {
      if (this.isLanguageAvailable(lang)) {
        available.add(lang);
      }
    }
    return Array.from(available).sort();
  }

  /**
   * Lists all installable/supported languages with human-readable display names.
   */
  public listInstallableLanguages(): InstallableLanguage[] {
    const list: InstallableLanguage[] = [];
    for (const [id, displayName] of Object.entries(LanguageRegistry.DISPLAY_NAMES)) {
      if (this.isLanguageAvailable(id)) {
        list.push({ identifier: id, displayName });
      }
    }
    return list;
  }

  /**
   * Checks if a language grammar is actually available in the WebAssembly pack.
   */
  public isLanguageAvailable(languageName: string): boolean {
    const canonical = this.canonicalLanguageName(languageName);
    return isTreeSitterLanguageSupported(canonical);
  }

  /**
   * Normalizes aliases (e.g. py -> python, c_sharp -> csharp, js -> javascript, tsx -> tsx).
   */
  public canonicalLanguageName(language: string): string {
    const normalized = language.toLowerCase().trim();
    if (normalized === 'py') return 'python';
    if (normalized === 'js') return 'javascript';
    if (normalized === 'ts') return 'typescript';
    if (normalized === 'rs') return 'rust';
    if (normalized === 'c_sharp') return 'csharp';
    if (normalized === 'rb') return 'ruby';
    if (normalized === 'sh') return 'bash';
    if (normalized === 'jsx') return 'javascript';
    if (normalized === 'tsx') return 'tsx';
    return normalized;
  }
}

export const languageRegistry = new LanguageRegistry();
