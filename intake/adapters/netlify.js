'use strict';

/**
 * Adaptador Netlify (se conserva para no atar el proyecto a un hosting).
 * Traduce el evento de Netlify a la lógica de core/ y devuelve su respuesta.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..');
const config = require(path.join(ROOT, 'public', 'config.json'));
const { handleCreateIssue } = require(path.join(ROOT, 'core', 'handler.js'));

const ALLOWED_ORIGIN_SUFFIX = ['netlify.app', 'github.io', 'alegra.com', 'localhost'];

function originAllowed(event) {
  const origin = event.headers.origin || event.headers.Origin;
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return ALLOWED_ORIGIN_SUFFIX.some((s) => host === s || host.endsWith('.' + s));
  } catch {
    return false;
  }
}

exports.handler = async function (event) {
  const json = (statusCode, obj) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(obj),
  });

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method Not Allowed' };
  }
  if (!originAllowed(event)) return json(403, { success: false, error: 'Origen no permitido.' });

  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) return json(500, { success: false, error: 'Falta la variable LINEAR_API_KEY.' });

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { success: false, error: 'Payload inválido (no es JSON).' });
  }

  try {
    const { status, payload } = await handleCreateIssue({ apiKey, config, body });
    return json(status, payload);
  } catch (err) {
    return json(500, { success: false, error: err.message });
  }
};
