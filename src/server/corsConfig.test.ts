import { describe, test, expect } from 'vitest';
import { createCorsOptions, parseCorsConfig } from './corsConfig';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} (actual=${a}, expected=${e})`);
}

function assertThrows(fn: () => void, message: string): void {
  try {
    fn();
  } catch {
    return;
  }
  throw new Error(message);
}

describe('CORS Config - parseCorsConfig', () => {
  test('default http://localhost:3000 quando a variavel esta ausente', () => {
    const config = parseCorsConfig({});
    assertEqual(config, { origins: ['http://localhost:3000'], wildcard: false }, 'default');
  });

  test('default http://localhost:3000 quando a variavel esta vazia', () => {
    const config = parseCorsConfig({ MCP_CORS_ORIGINS: '' });
    assertEqual(config, { origins: ['http://localhost:3000'], wildcard: false }, 'default');
  });

  test('lista separada por virgula com espacos e trim', () => {
    const config = parseCorsConfig({ MCP_CORS_ORIGINS: ' https://a.com , https://b.com ' });
    assertEqual(config.origins, ['https://a.com', 'https://b.com'], 'origins parseadas');
  });

  test('barra final e removida pela canonicalizacao', () => {
    const config = parseCorsConfig({ MCP_CORS_ORIGINS: 'https://a.com/' });
    assertEqual(config.origins, ['https://a.com'], 'sem barra final');
  });

  test('host maiusculo e normalizado para minusculo', () => {
    const config = parseCorsConfig({ MCP_CORS_ORIGINS: 'https://App.Example.COM' });
    assertEqual(config.origins, ['https://app.example.com'], 'host minusculo');
  });

  test('porta default (443) e omitida na canonicalizacao', () => {
    const config = parseCorsConfig({ MCP_CORS_ORIGINS: 'https://a.com:443' });
    assertEqual(config.origins, ['https://a.com'], 'porta default omitida');
  });

  test('porta nao-default e preservada', () => {
    const config = parseCorsConfig({ MCP_CORS_ORIGINS: 'http://localhost:5173' });
    assertEqual(config.origins, ['http://localhost:5173'], 'porta preservada');
  });

  test('duplicatas (incluindo com barra final) sao deduplicadas', () => {
    const config = parseCorsConfig({ MCP_CORS_ORIGINS: 'https://a.com,https://a.com/' });
    assertEqual(config.origins, ['https://a.com'], 'deduplicadas');
  });

  test('origem relativa sem protocolo aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: 'example.com' }), 'deveria abortar');
  });

  test('protocolo nao http(s) aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: 'ftp://example.com' }), 'deveria abortar');
  });

  test('origem com path aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: 'https://a.com/app' }), 'deveria abortar');
  });

  test('origem com query aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: 'https://a.com?x=1' }), 'deveria abortar');
  });

  test('origem com fragment aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: 'https://a.com#top' }), 'deveria abortar');
  });

  test('origem com userinfo aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: 'https://user:pw@a.com' }), 'deveria abortar');
  });

  test('null byte aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: 'https://a.com\0' }), 'deveria abortar');
  });

  test('lista apenas com virgulas aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: ' , , ' }), 'deveria abortar');
  });

  test('"*" sem opt-in aborta (fail-closed)', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ORIGINS: '*' }), 'deveria abortar');
    assertThrows(
      () => parseCorsConfig({ MCP_CORS_ORIGINS: '*', MCP_CORS_ALLOW_WILDCARD: 'false' }),
      'deveria abortar'
    );
  });

  test('"*" com opt-in explicito ativa wildcard', () => {
    const config = parseCorsConfig({ MCP_CORS_ORIGINS: '*', MCP_CORS_ALLOW_WILDCARD: 'true' });
    assertEqual(config, { origins: ['*'], wildcard: true }, 'wildcard');
  });

  test('"*" misturado com origens explicitas aborta (mesmo com opt-in)', () => {
    assertThrows(
      () => parseCorsConfig({ MCP_CORS_ORIGINS: '*,https://a.com', MCP_CORS_ALLOW_WILDCARD: 'true' }),
      'deveria abortar'
    );
  });

  test('"*" dentro de uma origem aborta (cors compara por igualdade estrita)', () => {
    assertThrows(
      () => parseCorsConfig({ MCP_CORS_ORIGINS: 'https://*.example.com' }),
      'deveria abortar'
    );
  });

  test('MCP_CORS_ALLOW_WILDCARD invalido aborta', () => {
    assertThrows(() => parseCorsConfig({ MCP_CORS_ALLOW_WILDCARD: 'yes' }), 'deveria abortar');
  });

  test('opt-in sem "*" permanece allowlist (flag e apenas permissao)', () => {
    const config = parseCorsConfig({
      MCP_CORS_ORIGINS: 'https://a.com',
      MCP_CORS_ALLOW_WILDCARD: 'true',
    });
    assertEqual(config, { origins: ['https://a.com'], wildcard: false }, 'allowlist');
  });
});

describe('CORS Config - createCorsOptions', () => {
  test('modo allowlist: reflete lista, credentials true', () => {
    const options = createCorsOptions({ origins: ['https://a.com'], wildcard: false });
    assertEqual(options.origin, ['https://a.com'], 'origin');
    assertEqual(options.credentials, true, 'credentials');
    assertEqual(options.methods, ['GET', 'POST', 'OPTIONS'], 'methods');
    assertEqual(options.allowedHeaders, ['Content-Type', 'Authorization'], 'allowedHeaders');
  });

  test('modo wildcard: origin "*", credentials false', () => {
    const options = createCorsOptions({ origins: ['*'], wildcard: true });
    assertEqual(options.origin, '*', 'origin');
    assertEqual(options.credentials, false, 'credentials');
    assertEqual(options.methods, ['GET', 'POST', 'OPTIONS'], 'methods');
    assertEqual(options.allowedHeaders, ['Content-Type', 'Authorization'], 'allowedHeaders');
  });
});
