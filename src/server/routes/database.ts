import { sendRouteError } from '../httpErrors';
import { Router } from 'express';
import { sqliteStorage } from '../db';

export function createDatabaseRouter(options: { writeEnabled: boolean }): Router {
  const router = Router();

  // SQLite Database Explorer API
  router.get('/api/database/schema', (req, res) => {
    try {
      const schema = sqliteStorage.getDatabaseSchema();
      res.json(schema);
    } catch (err) {
      return sendRouteError(req, res, err, 'Falha ao inspecionar o esquema do banco de dados.');
    }
  });

  router.get('/api/database/table/:name', (req, res) => {
    try {
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;
      const data = sqliteStorage.getTableRecords(req.params.name, limit, offset);
      res.json(data);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao consultar o banco de dados.' });
    }
  });

  router.post('/api/database/query', (req, res) => {
    try {
      const { sql } = req.body;
      if (!sql || typeof sql !== 'string') {
        return res.status(400).json({ error: 'Parâmetro SQL é obrigatório e deve ser uma string.' });
      }
      const result = sqliteStorage.executeRawQuery(sql, { allowWrite: options.writeEnabled });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err instanceof Error && err.message) || 'Erro na execução da consulta SQL.' });
    }
  });

  return router;
}
