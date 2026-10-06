/**
 * AST/Tree-sitter Language-Agnostic Specification - Section 7
 * Tree Caching Strategy with Content Hash Indexing and Incremental Parse
 */

import Parser from 'web-tree-sitter';
import crypto from 'crypto';
import { serverConfig } from './config';
import { parseRawTree, getTreeSitterLanguage } from './treeSitter';

export interface CachedTree {
  tree: Parser.Tree;
  tsLanguage: Parser.Language;
  contentHash: string;
  language: string;
  timestamp: number;
  byteSize: number;
}

export class TreeCache {
  private enabled: boolean;
  private maxSizeMB: number;
  private ttlSeconds: number;
  private cache = new Map<string, CachedTree>();
  private currentSizeBytes: number = 0;

  constructor() {
    const config = serverConfig.getConfig().cache;
    this.enabled = config.enabled;
    this.maxSizeMB = config.max_size_mb;
    this.ttlSeconds = config.ttl_seconds;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.invalidate();
    }
  }

  public setMaxSizeMB(maxSizeMB: number): void {
    this.maxSizeMB = maxSizeMB;
    this.evictIfNeeded(0);
  }

  public setTTLSeconds(ttlSeconds: number): void {
    this.ttlSeconds = ttlSeconds;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Generates a cryptographic SHA-256 hash key for source code and grammar.
   */
  public generateHashKey(source: string, language: string): string {
    const hash = crypto.createHash('sha256').update(source).digest('hex').slice(0, 32);
    return `${language.toLowerCase()}:${hash}`;
  }

  /**
   * Retrieves a cached Tree by source content and language, or parses and caches it.
   */
  public async getOrParseTree(
    source: string,
    language: string,
    oldTree?: Parser.Tree | null
  ): Promise<{ tree: Parser.Tree; tsLanguage: Parser.Language }> {
    const key = this.generateHashKey(source, language);

    if (this.enabled) {
      const existing = this.cache.get(key);
      if (existing) {
        // Check TTL
        const now = Date.now();
        if (now - existing.timestamp <= this.ttlSeconds * 1000) {
          // Refresh LRU
          this.cache.delete(key);
          this.cache.set(key, existing);
          return { tree: existing.tree, tsLanguage: existing.tsLanguage };
        } else {
          this.deleteEntry(key, existing);
        }
      }
    }

    // Parse fresh or incremental (propagates LanguageNotFoundError or ParsingError)
    const parsed = await parseRawTree(source, language, oldTree);

    if (this.enabled) {
      const byteSize = Buffer.byteLength(source, 'utf8') || 1024;
      this.evictIfNeeded(byteSize);

      const existing = this.cache.get(key);
      if (existing) {
        this.deleteEntry(key, existing);
      }

      const entry: CachedTree = {
        tree: parsed.tree,
        tsLanguage: parsed.tsLanguage,
        contentHash: key,
        language: language.toLowerCase(),
        timestamp: Date.now(),
        byteSize,
      };

      this.cache.set(key, entry);
      this.currentSizeBytes += byteSize;
    }

    return parsed;
  }

  public get(filePathOrSource: string, language: string): CachedTree | null {
    if (!this.enabled) return null;
    const key = this.generateHashKey(filePathOrSource, language);
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.ttlSeconds * 1000) {
      this.deleteEntry(key, entry);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  public put(filePathOrSource: string, language: string, tree: Parser.Tree, source: Uint8Array | string): void {
    if (!this.enabled) return;
    const key = this.generateHashKey(typeof source === 'string' ? source : filePathOrSource, language);
    const byteSize = typeof source === 'string' ? Buffer.byteLength(source) : source.byteLength || 1024;

    this.evictIfNeeded(byteSize);

    const existing = this.cache.get(key);
    if (existing) {
      this.deleteEntry(key, existing);
    }

    getTreeSitterLanguage(language).then((tsLanguage) => {
      if (!tsLanguage) return;
      const entry: CachedTree = {
        tree,
        tsLanguage,
        contentHash: key,
        language: language.toLowerCase(),
        timestamp: Date.now(),
        byteSize,
      };
      this.cache.set(key, entry);
      this.currentSizeBytes += byteSize;
    });
  }

  public invalidate(languageOrKey?: string): void {
    if (!languageOrKey) {
      for (const [key, entry] of this.cache.entries()) {
        this.deleteEntry(key, entry);
      }
      this.cache.clear();
      this.currentSizeBytes = 0;
      return;
    }

    const filter = languageOrKey.toLowerCase();
    for (const [key, entry] of this.cache.entries()) {
      if (key.startsWith(filter) || entry.language === filter) {
        this.deleteEntry(key, entry);
      }
    }
  }

  private deleteEntry(key: string, entry: CachedTree) {
    this.cache.delete(key);
    this.currentSizeBytes -= entry.byteSize;
    if (entry.tree && typeof entry.tree.delete === 'function') {
      try {
        entry.tree.delete();
      } catch {}
    }
  }

  private evictIfNeeded(incomingBytes: number): void {
    const maxBytes = this.maxSizeMB * 1024 * 1024;
    const threshold = maxBytes * 0.9;

    if (this.currentSizeBytes + incomingBytes > maxBytes || this.currentSizeBytes > threshold) {
      const targetSize = maxBytes * 0.7;
      for (const [key, entry] of this.cache.entries()) {
        if (this.currentSizeBytes + incomingBytes <= targetSize && this.cache.size <= 1) {
          break;
        }
        this.deleteEntry(key, entry);
      }
    }
  }

  public getStats() {
    return {
      enabled: this.enabled,
      entriesCount: this.cache.size,
      currentSizeMB: (this.currentSizeBytes / (1024 * 1024)).toFixed(2),
      maxSizeMB: this.maxSizeMB,
      ttlSeconds: this.ttlSeconds,
    };
  }
}

export const treeCache = new TreeCache();
