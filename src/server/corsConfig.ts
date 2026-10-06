/**
 * CORS origin allowlist configuration (audit finding SEC-04).
 *
 * Replaces the previous `app.use(cors())` wildcard configuration, which let
 * any website make (potentially credentialed) requests to the server. The
 * `cors` middleware is now configured with an explicit origin allowlist.
 *
 * Configuration:
 *   - MCP_CORS_ORIGINS: comma-separated list of allowed origins
 *     (e.g. "https://example.com,https://app.example.com").
 *     Default: "http://localhost:3000" (local development UI).
 *   - MCP_CORS_ALLOW_WILDCARD: explicit opt-in ("true") required before "*"
 *     is accepted in MCP_CORS_ORIGINS. In wildcard mode credentials are
 *     disabled — browsers reject credentialed wildcard responses (forbidden
 *     by the Fetch specification), and the audit remediation requires it.
 *
 * Parsed once at startup; malformed configuration aborts the process
 * (fail-fast, fail-closed), following the same pattern as the auth (SEC-02)
 * and workspace-roots (SEC-03) configurations.
 *
 * Validation rules:
 *   - Origins must be absolute http(s) URLs with a hostname and no path,
 *     query, fragment, or userinfo (an origin is scheme + host + port,
 *     per RFC 6454).
 *   - Origins are canonicalized via URL.origin (lowercase scheme/host,
 *     default port dropped, trailing "/" removed) so configuration cannot
 *     silently mismatch the Origin header browsers send.
 *   - "*" is rejected unless MCP_CORS_ALLOW_WILDCARD=true, cannot be
 *     combined with explicit origins, and cannot appear inside an origin
 *     (e.g. "https://*.example.com" — the cors package compares origins by
 *     strict equality, so such an entry would never match anything).
 *   - Null bytes are rejected (defensive; they never match a real Origin).
 *
 * Behavior notes:
 *   - Allowed origins are reflected in Access-Control-Allow-Origin with
 *     `Vary: Origin` (the cors package handles this for array origins).
 *   - Disallowed origins receive no CORS headers; the browser blocks the
 *     response. The request still executes server-side (CORS is a
 *     browser-enforced mechanism, not server access control) — endpoint
 *     authorization remains the job of the auth middleware (SEC-02).
 *   - Non-browser clients (curl, MCP SDKs) send no Origin header and are
 *     unaffected.
 *   - Preflight (OPTIONS) requests are answered 204 by the cors middleware
 *     with Access-Control-Allow-Methods: GET, POST, OPTIONS and
 *     Access-Control-Allow-Headers: Content-Type, Authorization. DELETE is
 *     intentionally absent: REST endpoints do not require credentials yet
 *     (see docs/04-governance/api-specification.md), so refusing
 *     cross-origin DELETE preflight is CSRF hardening, not a regression.
 *     The bundled web UI is same-origin and unaffected.
 */

/** Default allowlist: the local development UI served by Vite. */
const DEFAULT_CORS_ORIGINS = 'http://localhost:3000';

/** Methods cross-origin callers may use (preflight response). */
const ALLOWED_METHODS = ['GET', 'POST', 'OPTIONS'];

/** Request headers cross-origin callers may send (preflight response). */
const ALLOWED_HEADERS = ['Content-Type', 'Authorization'];

/** Validated CORS configuration (parsed once at startup). */
export interface CorsConfig {
  /** Canonical allowed origins; contains ["*"] in wildcard mode. */
  origins: string[];
  /** Whether wildcard mode is active (explicit opt-in via env). */
  wildcard: boolean;
}

/**
 * Subset of the `cors` package options used by this server. Declared locally
 * because @types/cors is not a dependency; the shape must stay compatible
 * with what the cors package expects.
 */
export interface CorsOptions {
  origin: string | string[];
  credentials: boolean;
  methods: string[];
  allowedHeaders: string[];
}

/** Parses a boolean env var that must be "true" or "false" ("" = unset). */
function parseBooleanEnv(raw: string | undefined, name: string): boolean {
  const value = raw?.trim();
  if (value === undefined || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid ${name} value "${value}": expected "true" or "false"`);
}

/**
 * Canonicalizes and validates a single origin entry. Returns the canonical
 * origin (lowercase scheme/host, default port omitted, no trailing slash)
 * or throws with a descriptive, configuration-facing message.
 */
function canonicalizeOrigin(entry: string): string {
  let parsed: URL;
  try {
    parsed = new URL(entry);
  } catch {
    throw new Error(
      `Invalid MCP_CORS_ORIGINS entry "${entry}": expected an absolute origin like https://example.com`
    );
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid MCP_CORS_ORIGINS entry "${entry}": only http and https origins are supported`
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      `Invalid MCP_CORS_ORIGINS entry "${entry}": origins must not include userinfo`
    );
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(
      `Invalid MCP_CORS_ORIGINS entry "${entry}": origins must not include a path, query, or fragment`
    );
  }
  // URL.origin is the canonical serialized origin (RFC 6454): lowercase
  // scheme/host, default port omitted, no trailing slash.
  return parsed.origin;
}

/**
 * Parses and validates CORS configuration from the environment.
 * Throws (and therefore aborts startup) on malformed or inconsistent
 * security settings — a broken allowlist must never pass silently.
 */
export function parseCorsConfig(env: NodeJS.ProcessEnv): CorsConfig {
  const wildcardAllowed = parseBooleanEnv(env.MCP_CORS_ALLOW_WILDCARD, 'MCP_CORS_ALLOW_WILDCARD');

  const raw = env.MCP_CORS_ORIGINS;
  const list = raw === undefined || raw.trim() === '' ? DEFAULT_CORS_ORIGINS : raw;

  const entries = list
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new Error(
      `Invalid MCP_CORS_ORIGINS "${raw}": expected a comma-separated list of origins`
    );
  }

  if (entries.some((entry) => entry.includes('\0'))) {
    throw new Error('Invalid MCP_CORS_ORIGINS: origins must not contain null bytes');
  }

  const hasWildcard = entries.includes('*');
  if (hasWildcard && !wildcardAllowed) {
    throw new Error(
      'MCP_CORS_ORIGINS contains "*" but wildcard mode is not enabled: ' +
        'set MCP_CORS_ALLOW_WILDCARD=true to opt in explicitly, or list explicit origins'
    );
  }
  if (hasWildcard && entries.length > 1) {
    throw new Error('Invalid MCP_CORS_ORIGINS: "*" cannot be combined with explicit origins');
  }
  if (entries.some((entry) => entry.includes('*') && entry !== '*')) {
    throw new Error(
      'Invalid MCP_CORS_ORIGINS: "*" is only supported as the sole entry, ' +
        'not as a wildcard inside an origin'
    );
  }

  const origins = hasWildcard
    ? ['*']
    : [...new Set(entries.map((entry) => canonicalizeOrigin(entry)))];

  return { origins, wildcard: hasWildcard };
}

/**
 * Builds the `cors` middleware options from the validated configuration.
 *
 * Wildcard mode forces credentials off: `Access-Control-Allow-Origin: *`
 * combined with `Access-Control-Allow-Credentials: true` is rejected by
 * browsers and forbidden by the CORS specification (Fetch standard).
 */
export function createCorsOptions(config: CorsConfig): CorsOptions {
  if (config.wildcard) {
    return {
      origin: '*',
      credentials: false,
      methods: ALLOWED_METHODS,
      allowedHeaders: ALLOWED_HEADERS,
    };
  }
  return {
    origin: config.origins,
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
  };
}
