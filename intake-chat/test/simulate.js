/**
 * Simula la conversación completa del bot contra Linear REAL.
 * Crea issues de verdad, los verifica y los archiva al terminar.
 *
 *   node test/simulate.js
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = require('../core/config.js');
const Flow = require('../core/flow.js');
const Linear = require('../core/linear-sync.js');

// ---------------------------------------------------------------- entorno
function loadKey() {
  const candidates = [
    process.env.LINEAR_API_KEY,
    path.join(process.env.HOME, '.secrets/alegra.env'),
    path.join(__dirname, '..', '..', 'intake', '.env'),
  ];
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes('=')) return c;
    if (c.includes('KEY') && !fs.existsSync(c)) continue;
    if (fs.existsSync(c)) {
      for (const line of fs.readFileSync(c, 'utf8').split('\n')) {
        if (line.startsWith('LINEAR_API_KEY=')) return line.split('=').slice(1).join('=').trim();
      }
    }
  }
  throw new Error('No encontré LINEAR_API_KEY.');
}
const KEY = loadKey();

function curlTransport(url, opts) {
  const args = ['-s', '-w', '\n%{http_code}', '-X', (opts.method || 'post').toUpperCase()];
  for (const [k, v] of Object.entries(opts.headers || {})) args.push('-H', k + ': ' + v);
  args.push('--data-binary', '@-', url);
  const out = execFileSync('curl', args, { input: opts.body || '', encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const i = out.lastIndexOf('\n');
  return { status: Number(out.slice(i + 1)), text: out.slice(0, i) };
}
Linear.setTransport(curlTransport);

function gql(query, variables) {
  const r = curlTransport('https://api.linear.app/graphql', {
    headers: { 'Content-Type': 'application/json', Authorization: KEY },
    body: JSON.stringify({ query, variables: variables || {} }),
  });
  return JSON.parse(r.text).data;
}

// ---------------------------------------------------------------- utilidades
let fallos = 0;
function check(nombre, cond, detalle) {
  console.log((cond ? '  ✅ ' : '  ❌ ') + nombre + (detalle && !cond ? '  → ' + detalle : ''));
  if (!cond) fallos++;
}

const SOLICITANTE = { nombre: 'Fernando Rodríguez', email: 'fernando.rodriguez@alegra.com' };

function conversar(guion, opts) {
  opts = opts || {};
  const today = opts.today || Flow.toISO( new Date() );
  const chatId = opts.chatId || 'test-chat';
  let { state, reply } = Flow.start(CONFIG);
  state.startedAt = Date.now();

  const traza = [reply];
  let i = 0;
  let creado = null;
  const errores = [];

  while (i < 60) {
    i++;
    const step = reply.step;
    let entrada;

    if (reply.ready) { creado = reply.payload; break; }
    if (step === 'resumen') {
      entrada = { text: '/crear' };
    } else if (step === 'loops') {
      const pendientes = guion.loops || [];
      const yaMarcados = state.loops.length;
      entrada = yaMarcados < pendientes.length
        ? { action: 'loop|' + pendientes[yaMarcados] }
        : { action: 'loop|listo' };
    } else {
      entrada = { text: String(guion[step] !== undefined ? guion[step] : '') };
    }

    const out = Flow.input(CONFIG, state, entrada, {
      today: today,
      solicitante: SOLICITANTE,
      chatId: chatId,
      userId: 'u-test',
      idempotencyKey: opts.idempotencyKey,
    });
    state = out.state;
    reply = out.reply;
    traza.push(reply);
    if (reply.error) errores.push({ step: step, error: reply.error });
    if (reply.ready) { creado = reply.payload; break; }
    if (reply.cancelled) break;
  }
  return { state, reply, payload: creado, traza, errores };
}

function archivar(identifiers) {
  for (const ident of identifiers) {
    try {
      const d = gql('query($id:String!){issue(id:$id){id}}', { id: ident });
      gql('mutation($id:String!){issueArchive(id:$id){success}}', { id: d.issue.id });
    } catch (e) {
      console.log('   (no se pudo archivar ' + ident + ': ' + e.message + ')');
    }
  }
}

// ---------------------------------------------------------------- pruebas
const creados = [];

console.log('\n=== 1. Configuración del bot ===');
{
  const emails = new Set(Object.keys(CONFIG.people));
  check('el responsable por defecto existe en people', emails.has(CONFIG.defaultAssignee));
  check('todas las reglas apuntan a personas conocidas',
    CONFIG.assigneeRules.every(r => emails.has(r.email)));
  check('las versiones de las reglas existen',
    CONFIG.assigneeRules.every(r => !r.versions || r.versions.every(v => CONFIG.versiones.includes(v))));
  check('los canales de las reglas existen',
    CONFIG.assigneeRules.every(r => !r.canales || r.canales.every(c => CONFIG.canales.includes(c))));
  check('los loops del formulario existen',
    ['Loop - Brand', 'Loop - Product', 'Loop Content HUB'].every(l => CONFIG.loops.includes(l)));

  const casos = [
    ['COL', 'YouTube', 'pablo.munoz@alegra.com'],
    ['MEX', 'YouTube', 'ashley.mondragon@alegra.com'],
    ['COL', 'Social Media', 'darwing.lopez@alegra.com'],
    ['MEX', 'Social Media', 'darwing.lopez@alegra.com'],
    ['CRI', 'YouTube', 'katherine.rios@alegra.com'],
    ['CRI', 'Social Media', 'katherine.rios@alegra.com'],
    ['DOM', 'YouTube', 'katherine.rios@alegra.com'],
    ['DOM', 'Social Media', 'katherine.rios@alegra.com'],
    ['ESP', 'YouTube', 'ashley.mondragon@alegra.com'],
  ];
  casos.forEach(([v, ch, esperado]) => {
    const got = Flow.resolveAssignee(CONFIG, v, ch);
    check(`${v} · ${ch} → ${esperado.split('@')[0]}`, got.email === esperado, got.email);
  });
}

console.log('\n=== 2. Conversación completa: COL · Social Media (debe ir a Darwing) ===');
{
  const { payload, errores } = conversar({
    titulo: '[PRUEBA BOT] Reel prueba automatizada',
    objetivo: 'Validar el bot de Google Chat de punta a punta.',
    contexto: 'Prueba técnica. Se archiva al terminar.',
    version: 'COL',
    canal: 'Social Media',
    formato: 'Reel 9:16',
    duracion: '30s',
    cantidad: '2',
    loops: ['Loop - Brand'],
    icp: 'Pyme',
    aprobador: 'Fernando Rodríguez',
    fecha: '+10',
    guion: 'https://docs.google.com/document/d/prueba-bot-guion',
    grabacion: 'https://drive.google.com/file/d/prueba-bot-grabacion',
    madre: 'no',
  });
  check('la conversación terminó con un payload', Boolean(payload), JSON.stringify(errores));
  check('no hubo errores de validación', errores.length === 0, JSON.stringify(errores));
  check('la fecha se calculó relativa (+10)', /^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate), payload.dueDate);

  const res = Linear.createIssue(CONFIG, payload, KEY);
  creados.push(res.identifier);
  console.log('   → ' + res.identifier + ' ' + res.url);
  check('issue creado', Boolean(res.identifier));
  check('asignado a Darwing', res.assignee.email === 'darwing.lopez@alegra.com', res.assignee.email);
  check('solicitante mencionado', res.mentioned === true);

  const v = gql('query($id:String!){issue(id:$id){state{name} dueDate assignee{email} labels{nodes{name}} comments{nodes{body}} description}}', { id: res.identifier }).issue;
  check('estado Todo', v.state.name === 'Todo', v.state.name);
  check('fecha guardada', v.dueDate === payload.dueDate, v.dueDate);
  check('4 labels aplicados', v.labels.nodes.length === 4, v.labels.nodes.map(l => l.name).join());
  check('label nuevo All ICPs no aplica aquí', v.labels.nodes.some(l => l.name === 'Social Media'));
  check('comentario con mención', v.comments.nodes[0].body.indexOf('profiles/fer-sm') !== -1);
  check('descripción trae el formato', v.description.indexOf('Reel 9:16') !== -1);
  check('marcador de idempotencia', v.description.indexOf('<!-- intake:v2.0:chat-') !== -1);
}

console.log('\n=== 3. Canal Paid · MEX (debe ir a Ashley y crear 2 sub-issues) ===');
{
  const { payload, errores } = conversar({
    titulo: '[PRUEBA BOT] Ad Paid',
    objetivo: 'Validar sub-issues desde Chat.',
    contexto: 'Prueba técnica.',
    version: 'MEX',
    canal: 'Paid',
    formato: 'Video 16:9',
    duracion: '60s',
    cantidad: '1',
    loops: ['Loop - Events'],
    icp: 'Empresa',
    aprobador: 'Ashley Mondragón',
    fecha: '+15',
    madre: 'TMDCTMD-1',
  }, { idempotencyKey: 'bot-paid-test-1' });

  check('no pidió guión ni grabación (canal Paid)', !payload.links.guion && !payload.links.grabacion);
  check('sin errores', errores.length === 0, JSON.stringify(errores));

  const res = Linear.createIssue(CONFIG, payload, KEY);
  creados.push(res.identifier);
  (res.subIssues || []).forEach(s => creados.push(s.identifier));
  console.log('   → ' + res.identifier + ' + ' + (res.subIssues || []).length + ' sub-issues');
  check('asignado a Ashley', res.assignee.email === 'ashley.mondragon@alegra.com', res.assignee.email);
  check('creó 2 sub-issues', (res.subIssues || []).length === 2);
  if (res.subIssues && res.subIssues.length === 2) {
    check('el guión vence antes que la grabación', res.subIssues[0].dueDate < res.subIssues[1].dueDate,
      res.subIssues.map(s => s.dueDate).join(' / '));
  }
}

console.log('\n=== 4. Idempotencia: mismo envío dos veces ===');
{
  const guion = {
    titulo: '[PRUEBA BOT] Duplicado', objetivo: 'Probar duplicados.', contexto: 'Prueba.',
    version: 'CRI', canal: 'YouTube', formato: 'Video 16:9', duracion: '90s', cantidad: '1',
    loops: ['Loop - HQC'], icp: 'Contador', aprobador: 'Katherine Ríos', fecha: '+12',
    guion: 'https://docs.google.com/d/g', grabacion: 'https://drive.google.com/f/g', madre: 'no',
  };
  const a = conversar(guion, { idempotencyKey: 'dup-test-fijo' });
  const r1 = Linear.createIssue(CONFIG, a.payload, KEY);
  creados.push(r1.identifier);
  check('CRI + YouTube va a Katherine', r1.assignee.email === 'katherine.rios@alegra.com', r1.assignee.email);

  const b = conversar(guion, { idempotencyKey: 'dup-test-fijo' });
  const r2 = Linear.createIssue(CONFIG, b.payload, KEY);
  check('el segundo envío NO crea un issue nuevo', r2.duplicate === true, JSON.stringify(r2));
  check('devuelve el mismo issue', r2.identifier === r1.identifier, r2.identifier + ' vs ' + r1.identifier);
}

console.log('\n=== 5. Validaciones de la conversación ===');
{
  // Loop - Product sin pantallas
  const p = conversar({
    titulo: 'x', objetivo: 'y', contexto: 'z', version: 'COL', canal: 'YouTube',
    formato: 'Reel 9:16', duracion: '30s', cantidad: '1', loops: ['Loop - Product'],
    icp: 'Pyme', aprobador: 'F', fecha: '+7',
    guion: 'https://a.com/x', grabacion: 'https://b.com/y', pantallas_yn: 'No',
  });
  check('Loop - Product rechaza "No hay pantallas"', p.errores.some(e => e.step === 'pantallas_yn'));
  check('no se creó nada', p.payload === null || !p.payload);

  // Fecha en el pasado: se avanza hasta el paso de fecha y se responde mal
  const { state: stFecha } = avanzarHasta('fecha', '2026-11-25');
  const rFecha = Flow.input(CONFIG, stFecha, { text: '2020-01-01' }, { today: '2026-11-25', solicitante: SOLICITANTE });
  check('rechaza fecha pasada', Boolean(rFecha.reply.error) && rFecha.state.step === 'fecha',
    String(rFecha.reply.text).slice(0, 60));

  const rOk = Flow.input(CONFIG, stFecha, { text: '5/12' }, { today: '2026-11-25', solicitante: SOLICITANTE });
  check('entiende 5/12 como 2026-12-05', !rOk.reply.error && rOk.state.data.fecha === '2026-12-05',
    rOk.state.data.fecha);
}

function avanzarHasta(objetivo, today) {
  const validas = {
    titulo: 'Título de prueba', objetivo: 'Objetivo de prueba', contexto: 'Contexto de prueba',
    version: 'COL', canal: 'YouTube', formato: 'Reel 9:16', duracion: '30s',
    cantidad: '1', icp: 'Pyme', aprobador: 'Fernando', fecha: '+7',
    guion: 'https://a.com/x', grabacion: 'https://b.com/y', madre: 'no',
  };
  let { state, reply } = Flow.start(CONFIG);
  for (let i = 0; i < 30; i++) {
    if (reply.step === objetivo) return { state, reply };
    if (reply.step === 'resumen') break;
    let out;
    if (reply.step === 'loops') {
      if (!state.loops.length) out = Flow.input(CONFIG, state, { action: 'loop|Loop - Brand' }, { today });
      else out = Flow.input(CONFIG, state, { action: 'loop|listo' }, { today });
    } else {
      out = Flow.input(CONFIG, state, { text: validas[reply.step] || '' }, { today, solicitante: SOLICITANTE });
    }
    state = out.state; reply = out.reply;
  }
  throw new Error('no se llegó al paso ' + objetivo);
}

console.log('\n=== 6. Cancelar a mitad de camino ===');
{
  let { state } = Flow.start(CONFIG);
  Flow.input(CONFIG, state, { text: 'Título cualquiera' });
  const out = Flow.input(CONFIG, state, { text: '/cancelar' });
  check('cancelar no deja estado', out.state === null && out.reply.cancelled === true);
}

console.log('\n=== 7. El comando es /video y solo /video ===');
{
  check('/video arranca', Flow.isStart('/video') === true);
  check('/video con texto arranca', Flow.isStart('/video reel Colombia') === true);
  check('"video de ayer" NO arranca', Flow.isStart('video de ayer') === false);
  check('"hola" NO arranca', Flow.isStart('hola') === false);
  check('/pieza ya no arranca', Flow.isStart('/pieza') === false);
}

console.log('\n=== Limpieza: archivando ' + creados.length + ' issues de prueba ===');
archivar(creados);
const quedan = gql('query{issues(first:10,filter:{title:{contains:"PRUEBA BOT"}}){nodes{identifier archivedAt}}}', {})
  .issues.nodes.filter(i => !i.archivedAt);
check('no quedan issues de prueba activos', quedan.length === 0, JSON.stringify(quedan));

console.log('\n' + (fallos === 0 ? '✅ TODO OK — ' : '❌ ' + fallos + ' fallo(s) — ') + 'fin\n');
process.exit(fallos === 0 ? 0 : 1);
