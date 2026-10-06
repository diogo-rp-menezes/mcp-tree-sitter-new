/**
 * AST/Tree-sitter Language-Agnostic Specification - Section 9
 * Configuration Schema & Precedence Manager
 */

export interface CacheConfig {
  enabled: boolean;
  max_size_mb: number;
  ttl_seconds: number;
}

export interface SecurityConfig {
  max_file_size_mb: number;
  excluded_dirs: string[];
  allowed_extensions: string[] | null;
}

export interface LanguageConfig {
  auto_install: boolean;
  default_max_depth: number;
  preferred_languages: string[];
}

export interface ServerConfig {
  cache: CacheConfig;
  security: SecurityConfig;
  language: LanguageConfig;
  log_level: string;
  max_results_default: number;
}

export class ConfigurationManager {
  private config: ServerConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private getDefaultConfig(): ServerConfig {
    return {
      cache: {
        enabled: true,
        max_size_mb: 100,
        ttl_seconds: 300,
      },
      security: {
        max_file_size_mb: 5,
        excluded_dirs: ['.git', 'node_modules', '__pycache__', '.venv', 'venv', '.tox', 'dist', 'build'],
        allowed_extensions: null,
      },
      language: {
        auto_install: false,
        default_max_depth: 5,
        preferred_languages: ['python', 'javascript', 'typescript', 'rust', 'go'],
      },
      log_level: 'INFO',
      max_results_default: 100,
    };
  }

  public loadConfig(): ServerConfig {
    const config = this.getDefaultConfig();
    const env = process.env;

    // Cache config
    if (env.MCP_TS_CACHE__ENABLED !== undefined || env.MCP_TS_CACHE_ENABLED !== undefined) {
      const val = env.MCP_TS_CACHE__ENABLED ?? env.MCP_TS_CACHE_ENABLED;
      config.cache.enabled = val === 'true' || val === '1';
    }
    if (env.MCP_TS_CACHE__MAX_SIZE_MB || env.MCP_TS_CACHE_MAX_SIZE_MB) {
      config.cache.max_size_mb = Number(env.MCP_TS_CACHE__MAX_SIZE_MB || env.MCP_TS_CACHE_MAX_SIZE_MB);
    }
    if (env.MCP_TS_CACHE__TTL_SECONDS || env.MCP_TS_CACHE_TTL_SECONDS) {
      config.cache.ttl_seconds = Number(env.MCP_TS_CACHE__TTL_SECONDS || env.MCP_TS_CACHE_TTL_SECONDS);
    }

    // Security config
    if (env.MCP_TS_SECURITY__MAX_FILE_SIZE_MB || env.MCP_TS_SECURITY_MAX_FILE_SIZE_MB) {
      config.security.max_file_size_mb = Number(
        env.MCP_TS_SECURITY__MAX_FILE_SIZE_MB || env.MCP_TS_SECURITY_MAX_FILE_SIZE_MB
      );
    }
    if (env.MCP_TS_SECURITY__EXCLUDED_DIRS || env.MCP_TS_SECURITY_EXCLUDED_DIRS) {
      const val = env.MCP_TS_SECURITY__EXCLUDED_DIRS || env.MCP_TS_SECURITY_EXCLUDED_DIRS || '';
      config.security.excluded_dirs = val.split(',').map((s) => s.trim()).filter(Boolean);
    }
    if (env.MCP_TS_SECURITY__ALLOWED_EXTENSIONS || env.MCP_TS_SECURITY_ALLOWED_EXTENSIONS) {
      const val = env.MCP_TS_SECURITY__ALLOWED_EXTENSIONS || env.MCP_TS_SECURITY_ALLOWED_EXTENSIONS || '';
      config.security.allowed_extensions = val.split(',').map((s) => s.trim().replace(/^\./, '')).filter(Boolean);
    }

    // Language config
    if (env.MCP_TS_LANGUAGE__DEFAULT_MAX_DEPTH || env.MCP_TS_LANGUAGE_DEFAULT_MAX_DEPTH) {
      config.language.default_max_depth = Number(
        env.MCP_TS_LANGUAGE__DEFAULT_MAX_DEPTH || env.MCP_TS_LANGUAGE_DEFAULT_MAX_DEPTH
      );
    }
    if (env.MCP_TS_LANGUAGE__PREFERRED_LANGUAGES || env.MCP_TS_LANGUAGE_PREFERRED_LANGUAGES) {
      const val = env.MCP_TS_LANGUAGE__PREFERRED_LANGUAGES || env.MCP_TS_LANGUAGE_PREFERRED_LANGUAGES || '';
      config.language.preferred_languages = val.split(',').map((s) => s.trim()).filter(Boolean);
    }

    // General config
    if (env.MCP_TS_LOG_LEVEL) {
      config.log_level = env.MCP_TS_LOG_LEVEL.toUpperCase();
    }
    if (env.MCP_TS_MAX_RESULTS_DEFAULT) {
      config.max_results_default = Number(env.MCP_TS_MAX_RESULTS_DEFAULT);
    }

    return config;
  }

  public getConfig(): ServerConfig {
    return this.config;
  }

  public updateValue(pathStr: string, value: any): void {
    const keys = pathStr.split('.');
    let current: any = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  }
}

export const serverConfig = new ConfigurationManager();
