/**
 * Adaptador para Cloudflare Workers.
 *
 * Sirve cuando el formulario se publica en GitHub Pages: la página es estática
 * y la LINEAR_API_KEY tiene que vivir en un proceso, nunca en el navegador.
 * Este Worker recibe el POST del formulario y hace el trabajo.
 *
 * Desplegar:
 *   npm i -g wrangler
 *   wrangler login
 *   cd intake
 *   wrangler secret put LINEAR_API_KEY     # pega la key, queda cifrada
 *   wrangler deploy
 *
 * Luego copia la URL resultante en public/config.json -> "apiBase".
 */

import handlerModule from '../core/handler.js';
import config from '../public/config.json';

const { handleCreateIssue } = handlerModule;

// Dominios desde los que se acepta POST. Ajusta si cambia la URL de Pages.
const ALLOWED_ORIGINS = [
  'https://alegra-team.github.io',
  'http://localhost:8899',
];

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.some((o) => origin && origin.startsWith(o));
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: cors });
    }

    const json = (status, obj) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors },
      });

    if (!env.LINEAR_API_KEY) {
      return json(500, { success: false, error: 'Falta el secret LINEAR_API_KEY en el Worker.' });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { success: false, error: 'Payload inválido (no es JSON).' });
    }

    try {
      const out = await handleCreateIssue({ apiKey: env.LINEAR_API_KEY, config, body });
      return json(out.status, out.payload);
    } catch (err) {
      return json(500, { success: false, error: err.message });
    }
  },
};
