'use strict';

/**
 * Servidor local: sirve public/ y expone /api/create-issue con la misma
 * lógica que el adaptador de producción.
 *
 *   cd intake && npm run dev     -> http://localhost:8899
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '..', '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PUBLIC = path.join(__dirname, '..', 'public');
const config = require(path.join(PUBLIC, 'config.json'));
const { handleCreateIssue } = require(path.join(__dirname, '..', 'core', 'handler.js'));

const PORT = Number(process.env.PORT || 8899);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/api/create-issue') {
      const json = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(obj));
      };
      if (req.method !== 'POST') return json(405, { success: false, error: 'Method Not Allowed' });
      if (!process.env.LINEAR_API_KEY) return json(500, { success: false, error: 'Falta LINEAR_API_KEY en .env' });

      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', async () => {
        let body;
        try {
          body = JSON.parse(raw || '{}');
        } catch {
          return json(400, { success: false, error: 'Payload inválido.' });
        }
        try {
          const out = await handleCreateIssue({ apiKey: process.env.LINEAR_API_KEY, config, body });
          console.log(`[${new Date().toISOString()}] -> ${out.status} ${out.payload.issueId || out.payload.error || ''}`);
          json(out.status, out.payload);
        } catch (e) {
          console.error('ERROR', e.message);
          json(500, { success: false, error: e.message });
        }
      });
      return;
    }

    let file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
    if (!file.startsWith(PUBLIC)) return res.writeHead(403).end('Forbidden');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`TMD intake en http://localhost:${PORT}`);
    console.log(`LINEAR_API_KEY: ${process.env.LINEAR_API_KEY ? 'cargada' : 'FALTA (.env)'}`);
  });
