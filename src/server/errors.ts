/**
 * AST/Tree-sitter Language-Agnostic Specification - Section 10
 * Exception Hierarchy & Error Codes
 */

export class MCPTreeSitterError extends Error {
  public statusCode: number;
  public details?: Record<string, any>;

  constructor(message: string, statusCode: number = 500, details?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: this.name,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class LanguageError extends MCPTreeSitterError {
  constructor(message: string, statusCode: number = 404, details?: Record<string, any>) {
    super(message, statusCode, details);
  }
}

export class LanguageNotFoundError extends LanguageError {
  constructor(language: string, details?: Record<string, any>) {
    super(`Language '${language}' is not recognized or available in tree-sitter pack`, 404, {
      language,
      ...details,
    });
  }
}

export class LanguageInstallError extends LanguageError {
  constructor(language: string, message: string, details?: Record<string, any>) {
    super(`Failed to load or initialize grammar for '${language}': ${message}`, 500, {
      language,
      ...details,
    });
  }
}

export class ParsingError extends MCPTreeSitterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 500, details);
  }
}

export class ProjectError extends MCPTreeSitterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 404, details);
  }
}

export class FileAccessError extends MCPTreeSitterError {
  constructor(message: string, statusCode: number = 404, details?: Record<string, any>) {
    super(message, statusCode, details);
  }
}

export class QueryError extends MCPTreeSitterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 400, details);
  }
}

export class SecurityError extends MCPTreeSitterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 403, details);
  }
}

export class CacheError extends MCPTreeSitterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 500, details);
  }
}

/** Limite de memória do store excedido (HTTP 413). */
export class QuotaExceededError extends MCPTreeSitterError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 413, details);
  }
}

/** Extrai uma mensagem legível de qualquer valor lançado (`catch (err: unknown)`). */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
