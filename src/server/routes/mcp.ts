import { Router, type Response } from 'express';
import { toHttpError } from '../httpErrors';
import { logger, serializeError } from '../logger';
import path from 'path';
import { projectStore } from '../store';
import { MCP_TOOLS_METADATA, MCP_PROMPTS_METADATA, handleMCPToolCall, handleMCPPrompt } from '../mcp';

/** Clientes SSE ativos (encerrados no shutdown gracioso). */
export const activeSseClients = new Set<Response>();

export function createMcpRouter(): Router {
  const router = Router();

  // Full Model Context Protocol (MCP) JSON-RPC 2.0 Handler
  router.post('/api/mcp', async (req, res) => {
    const { jsonrpc, id, method, params } = req.body;

    if (jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: id ?? null,
        error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' },
      });
    }

    try {
      switch (method) {
        case 'initialize': {
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: { listChanged: false },
                prompts: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
              },
              serverInfo: {
                name: 'mcp-server-tree-sitter',
                version: '0.7.0',
              },
            },
          });
        }

        case 'tools/list': {
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              tools: MCP_TOOLS_METADATA,
            },
          });
        }

        case 'tools/call': {
          const { name, arguments: toolArgs } = params || {};
          if (!name) {
            return res.json({
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing tool name parameter' },
            });
          }
          const toolResult = await handleMCPToolCall(name, toolArgs || {});
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2),
                },
              ],
            },
          });
        }

        case 'prompts/list': {
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              prompts: MCP_PROMPTS_METADATA,
            },
          });
        }

        case 'prompts/get': {
          const { name, arguments: promptArgs } = params || {};
          const text = handleMCPPrompt(name, promptArgs || {});
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              description: `Generated prompt for ${name}`,
              messages: [
                {
                  role: 'user',
                  content: {
                    type: 'text',
                    text,
                  },
                },
              ],
            },
          });
        }

        case 'resources/list': {
          const projs = projectStore.listProjects();
          const resources = projs.flatMap((p) =>
            projectStore.listFiles(p.name).map((f) => ({
              uri: `file://${p.path.startsWith('/') ? '' : '/'}${p.path}/${f}`,
              name: `${p.name}/${f}`,
              mimeType: 'text/plain',
            }))
          );
          return res.json({
            jsonrpc: '2.0',
            id,
            result: { resources },
          });
        }

        case 'resources/read': {
          const { uri } = params || {};
          if (!uri || typeof uri !== 'string') {
            return res.json({
              jsonrpc: '2.0',
              id,
              error: { code: -32602, message: 'Missing or invalid uri parameter in resources/read' },
            });
          }

          const projs = projectStore.listProjects();
          let matchedContent: string | null = null;
          let matchedMimeType = 'text/plain';

          for (const p of projs) {
            const files = projectStore.listFiles(p.name);
            for (const f of files) {
              const fileUri = `file://${p.path.startsWith('/') ? '' : '/'}${p.path}/${f}`;
              if (uri === fileUri || uri.endsWith(`/${f}`) || uri.includes(`${p.name}/${f}`)) {
                const fileObj = projectStore.getFile(p.name, f);
                if (fileObj) {
                  matchedContent = fileObj.content;
                  break;
                }
              }
            }
            if (matchedContent !== null) break;
          }

          if (matchedContent === null) {
            return res.json({
              jsonrpc: '2.0',
              id,
              error: { code: -32002, message: `Resource not found for uri: ${uri}` },
            });
          }

          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              contents: [
                {
                  uri,
                  mimeType: matchedMimeType,
                  text: matchedContent,
                },
              ],
            },
          });
        }

        case 'ping': {
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {},
          });
        }

        case 'notifications/initialized': {
          // MCP notification, no response required or return empty ok
          return res.json({
            jsonrpc: '2.0',
            id: id ?? null,
            result: { status: 'acknowledged' },
          });
        }

        case 'roots/list': {
          const projs = projectStore.listProjects();
          return res.json({
            jsonrpc: '2.0',
            id,
            result: {
              roots: projs.map((p) => ({
                uri: `file://${p.path.startsWith('/') ? '' : '/'}${p.path}`,
                name: p.name,
              })),
            },
          });
        }

        default:
          return res.json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Method not found: ${method}` },
          });
      }
    } catch (error) {
      // Mesma política do REST: 5xx não vaza mensagens internas em produção; tudo vai para o log.
      const { status, body } = toHttpError(error);
      logger.error('mcp_request_failed', {
        reqId: res.locals.requestId,
        method,
        status,
        err: serializeError(error),
      });
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: -32603, message: body.message || 'Internal error' },
      });
    }
  });

  // Server-Sent Events (SSE) MCP Stream
  router.get('/mcp/sse', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    activeSseClients.add(res);

    const endpointMsg = JSON.stringify({ endpoint: '/api/mcp' });
    res.write(`event: endpoint\ndata: ${endpointMsg}\n\n`);

    const interval = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(interval);
      activeSseClients.delete(res);
    });
  });

  return router;
}
