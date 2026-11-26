/**
 * Librería del bot de intake — archivo único para pegar en Google Apps Script.
 *
 * GENERADO: no editar aquí. La fuente está en core/config.js, core/flow.js
 * y core/linear-sync.js de este repositorio.
 *
 * Regenerar:  node scripts/build-libreria.js
 */
// ===== config.js =====
/**
 * Configuración del bot de intake en Google Chat.
 *
 * Es la misma información que intake/public/config.json del formulario web.
 * El test (test/simulate.js) verifica que ambos no se desincronicen.
 */
var BOT_CONFIG = (function () {
  'use strict';

  var CONFIG = {
    version: '2.0',
    canal: 'google-chat',
    team: {
      key: 'TMDCTMD',
      id: '8f7a60e7-27d8-47da-b315-6b8d03f91a15',
      name: 'tmd-content-multimedia',
    },
    workspaceUrl: 'https://linear.app/alegra',
    initialState: 'Todo',
    defaultAssignee: 'ashley.mondragon@alegra.com',

    people: {
      'ashley.mondragon@alegra.com': { name: 'Ashley Mondragón', short: 'Ashley' },
      'pablo.munoz@alegra.com': { name: 'Pablo Muñoz', short: 'Pablo' },
      'katherine.rios@alegra.com': { name: 'Katherine Ríos', short: 'Katherine' },
      'darwing.lopez@alegra.com': { name: 'Darwing López', short: 'Darwing' },
      'aura.fuentes@alegra.com': { name: 'Aura Fuentes', short: 'Aura' },
    },

    assigneeRules: [
      { id: 'COL-YouTube', versions: ['COL'], canales: ['YouTube'], email: 'pablo.munoz@alegra.com', why: 'COL · YouTube' },
      { id: 'MEX-YouTube', versions: ['MEX'], canales: ['YouTube'], email: 'ashley.mondragon@alegra.com', why: 'MEX · YouTube' },
      { id: 'COL-MEX-Reels', versions: ['COL', 'MEX'], canales: ['Social Media'], email: 'darwing.lopez@alegra.com', why: 'COL/MEX · Reels (Social Media)' },
      { id: 'CRI-DOM-Reels-YouTube', versions: ['CRI', 'DOM'], canales: ['YouTube', 'Social Media'], email: 'katherine.rios@alegra.com', why: 'CRI/DOM · YouTube y Reels' },
      { id: 'Academy-Producto', canales: ['Academy', 'Producto'], email: 'aura.fuentes@alegra.com', why: 'Canal Academy / Producto' },
      { id: 'PDC', canales: ['PDC'], email: 'katherine.rios@alegra.com', why: 'Canal PDC' },
    ],

    labelAliases: { 'Loop - Content HUB': 'Loop Content HUB' },

    versiones: ['COL', 'MEX', 'DOM', 'CRI', 'PAN', 'ESP', 'ARG', 'PER', 'VEN', 'USA', 'ALL', '4X4', 'OTHERS'],
    canales: ['Social Media', 'YouTube', 'Content HUB', 'Academy', 'Paid', 'Landings', 'PDC', 'Apoyos', 'Producto'],
    icps: ['Empresa', 'Contador', 'Pyme', 'All ICPs'],
    loops: ['Loop - Brand', 'Loop - HQC', 'Loop - Events', 'Loop - Product', 'Loop Content HUB', 'Loop IE', 'Loop SAD'],
    formatos: ['Reel 9:16', 'Video 16:9', 'Short 9:16', 'Story 9:16', 'Carrusel 4:5', 'Cuadrado 1:1', 'Otro'],
    duraciones: ['15s', '30s', '45s', '60s', '90s', '+2 min', '4 min', '8+ min'],

    paidSubIssues: [
      {
        sufijo: 'Guión',
        diasAntes: 4,
        entrega: 'Guión escrito y aprobado por el solicitante. Entregable: documento con hook, cuerpo, CTA y referencias visuales.',
      },
      {
        sufijo: 'Grabación',
        diasAntes: 2,
        entrega: 'Grabación cruda (video y/o audio) lista para edición. Entregable: link al material original, sin cortes ni edición.',
      },
    ],
  };
  return CONFIG;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BOT_CONFIG;

// ===== flow.js =====
/**
 * Motor de la conversación del bot de intake.
 *
 * No sabe nada de Google Chat ni de Linear: recibe el estado, lo que escribió
 * la persona, y devuelve el siguiente mensaje. Así se puede probar entero sin
 * desplegar nada (ver test/simulate.js).
 */
var IntakeFlow = (function () {
  'use strict';

  var URL_RE = /^https?:\/\/[^\s]+$/i;
  var EMAIL_RE = /^[^\s@]+@alegra\.com$/i;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(iso, days) {
    var p = iso.split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + days);
    return toISO(d);
  }

  function isValidISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function parseFecha(raw, today) {
    var t = String(raw || '').trim().toLowerCase();
    if (!t) return null;

    if (/^\+\d{1,3}$/.test(t)) return addDays(today, Number(t.slice(1)));
    var rel = t.match(/^en\s+(\d{1,3})\s*(dias|días|d)?$/);
    if (rel) return addDays(today, Number(rel[1]));
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    var dm = t.match(/^(\d{1,2})[\/](\d{1,2})(?:[\/](\d{2,4}))?$/);
    if (dm) {
      var year = dm[3] ? Number(dm[3]) : Number(today.slice(0, 4));
      if (year < 100) year += 2000;
      return year + '-' + pad(Number(dm[2])) + '-' + pad(Number(dm[1]));
    }
    return null;
  }

  function resolveAssignee(config, version, canal) {
    for (var i = 0; i < config.assigneeRules.length; i++) {
      var r = config.assigneeRules[i];
      var okV = !r.versions || r.versions.indexOf(version) !== -1;
      var okC = !r.canales || r.canales.indexOf(canal) !== -1;
      if (okV && okC) return { email: r.email, why: r.why };
    }
    return { email: config.defaultAssignee, why: 'Sin dueño definido para esta combinación' };
  }

  function personName(config, email) {
    var p = config.people[email];
    return p ? p.name : email;
  }

  function labelName(config, n) {
    return (config.labelAliases && config.labelAliases[n]) || n;
  }

  // ---------------------------------------------------------------- pasos

  function steps(config) {
    return [
      {
        id: 'titulo', type: 'text', q: '¿Cómo se llama la pieza?',
        hint: 'Un título que el editor entienda solo. Ej: *Reel MCP launch — Colombia v1*',
        validate: function (v) {
          if (!v) return 'Necesito un título.';
          if (v.length > 180) return 'Máximo 180 caracteres.';
          return null;
        },
      },
      {
        id: 'objetivo', type: 'text', q: '¿Qué debe lograr esta pieza?',
        hint: 'La acción o percepción que esperas. Si sabes la etapa, dilo: TOFU, MOFU o BOFU.',
        validate: function (v) { return v ? null : 'Sin objetivo el editor no sabe para qué la hace.'; },
      },
      {
        id: 'contexto', type: 'text', q: 'Dame el contexto o brief.',
        hint: 'Campaña, ángulo creativo, tono, datos que hay que comunicar.',
        validate: function (v) { return v ? null : 'Necesito el contexto.'; },
      },
      {
        id: 'version', type: 'choice', q: '¿Para qué país o versión?',
        options: function (c) { return c.versiones; },
        quick: ['COL', 'MEX', 'DOM', 'CRI'],
      },
      {
        id: 'canal', type: 'choice', q: '¿Por qué canal se distribuye?',
        options: function (c) { return c.canales; },
        quick: ['Social Media', 'YouTube', 'Content HUB', 'Academy', 'Paid'],
      },
      {
        id: 'formato', type: 'choice', q: '¿En qué formato se entrega?',
        options: function (c) { return c.formatos; },
        quick: ['Reel 9:16', 'Video 16:9', 'Carrusel 4:5'],
      },
      {
        id: 'duracion', type: 'choice', q: '¿Duración objetivo?',
        options: function (c) { return c.duraciones; },
        quick: ['15s', '30s', '60s', '90s'],
      },
      {
        id: 'cantidad', type: 'number', q: '¿Cuántas piezas son?',
        hint: 'Si es una sola, escribe 1.',
        validate: function (v) {
          var n = Number(v);
          if (!/^\d+$/.test(String(v))) return 'Escribe un número.';
          if (n < 1 || n > 50) return 'Entre 1 y 50.';
          return null;
        },
      },
      {
        id: 'loops', type: 'multi', q: '¿A qué Loop pertenece?',
        hint: 'Puedes marcar varios. Cuando termines, toca *Listo*.',
        options: function (c) { return c.loops; },
        validate: function (v, state) {
          return (state.loops && state.loops.length) ? null : 'Marca al menos un Loop.';
        },
      },
      {
        id: 'icp', type: 'choice', q: '¿A quién le habla?',
        options: function (c) { return c.icps; },
        quick: ['Empresa', 'Contador', 'Pyme', 'All ICPs'],
      },
      {
        id: 'aprobador', type: 'text', q: '¿Quién da la aprobación final?',
        hint: 'El nombre de la persona que dice "va".',
        validate: function (v) { return v ? null : 'Necesito un aprobador.'; },
      },
      {
        id: 'fecha', type: 'date', q: '¿Para cuándo la necesitas?',
        hint: 'Escríbela así: *2026-12-05* o *5/12*. También puedes tocar un atajo.',
        quick: ['+7', '+14', '+21'],
        validate: function (v, state, today) {
          var iso = parseFecha(v, today);
          if (!iso) return 'No entendí la fecha. Usa 2026-12-05 o 5/12.';
          if (iso < today) return 'Esa fecha ya pasó.';
          return null;
        },
      },
      {
        id: 'guion', type: 'link', q: 'Pega el link del guión.',
        skipIf: function (s) { return s.data.canal === 'Paid'; },
        hint: 'Debe ser accesible para todo el equipo. Si no existe todavía, el canal correcto es *Paid*.',
        validate: function (v) { return URL_RE.test(v) ? null : 'Debe ser un link que empiece por https://'; },
      },
      {
        id: 'grabacion', type: 'link', q: 'Pega el link de la grabación.',
        skipIf: function (s) { return s.data.canal === 'Paid'; },
        hint: 'Video o audio crudo, listo para editar.',
        validate: function (v) { return URL_RE.test(v) ? null : 'Debe ser un link que empiece por https://'; },
      },
      {
        id: 'pantallas_yn', type: 'choice', q: '¿Hay pantallas grabadas del producto?',
        options: function () { return ['Sí', 'No']; },
        skipIf: function (s) { return (s.loops || []).indexOf('Loop - Product') === -1; },
        validate: function (v) {
          if (/^s/i.test(v)) return null;
          return 'Con *Loop - Product* las pantallas son obligatorias. Si no las tienes, avisa antes de seguir.';
        },
      },
      {
        id: 'pantallas_link', type: 'link', q: 'Pega el link de las pantallas grabadas.',
        skipIf: function (s) { return s.data.pantallas_yn !== 'Sí'; },
        validate: function (v) { return URL_RE.test(v) ? null : 'Debe ser un link https://'; },
      },
      {
        id: 'madre', type: 'text', q: '¿Cuelga de un issue madre? (campaña, cluster, lanzamiento)',
        hint: 'Pega el ID (*TMDCTMD-123*) o el link. Si va suelta, escribe *no*.',
        optional: true,
        validate: function (v) {
          if (/^(no|ninguno|n\/a|-)$/i.test(v)) return null;
          if (!/([A-Za-z]{2,}-\d+)/.test(v)) return 'No reconocí el ID. Ejemplo: TMDCTMD-123. O escribe *no*.';
          return null;
        },
      },
    ];
  }

  function applicable(config, state) {
    return steps(config).filter(function (s) {
      return !s.skipIf || !s.skipIf(state);
    });
  }

  function nextStep(config, state) {
    var list = applicable(config, state);
    if (state.step === null) return list[0];
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === state.step) idx = i;
    return list[idx + 1] || null;
  }

  function currentStep(config, state) {
    var list = applicable(config, state);
    for (var i = 0; i < list.length; i++) if (list[i].id === state.step) return list[i];
    return null;
  }

  function progress(config, state) {
    var list = applicable(config, state);
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === state.step) { n = i + 1; break; }
    }
    if (state.step === 'resumen') return list.length + '/' + list.length;
    return n + '/' + list.length;
  }

  // ---------------------------------------------------------------- mensajes

  function questionMessage(config, state) {
    var step = currentStep(config, state);
    if (!step) return buildSummary(config, state);
    var buttons = [];
    var opts = step.options ? step.options(config) : null;
    if (opts) {
      var quick = step.quick || opts;
      for (var i = 0; i < quick.length; i++) buttons.push({ label: quick[i], value: quick[i] });
      if (quick.length < opts.length) buttons.push({ label: 'Más opciones…', value: '/todas' });
    }
    if (state.step === 'loops') {
      buttons = opts.map(function (o) {
        var on = (state.loops || []).indexOf(o) !== -1;
        return { label: (on ? '✅ ' : '') + o, value: 'loop|' + o };
      });
      buttons.push({ label: 'Listo', value: 'loop|listo' });
    }
    return {
      step: state.step,
      progress: progress(config, state),
      text: '**' + step.q + '**' + (step.hint ? '\n' + step.hint : ''),
      buttons: buttons,
      done: false,
    };
  }

  function buildSummary(config, state) {
    var d = state.data;
    var a = resolveAssignee(config, d.version, d.canal);
    var lines = [
      '**Revisa y confirma**',
      '**' + d.titulo + '**',
      '',
      '• Versión: ' + d.version + '  ·  Canal: ' + d.canal,
      '• Formato: ' + d.formato + '  ·  Duración: ' + d.duracion + '  ·  Piezas: ' + d.cantidad,
      '• Loops: ' + (state.loops || []).join(', '),
      '• ICP: ' + d.icp,
      '• Fecha límite: ' + d.fecha,
      '• Aprobador: ' + d.aprobador,
      '• Se asigna a: **' + personName(config, a.email) + '** _(' + a.why + ')_',
    ];
    if (d.canal === 'Paid') lines.push('• Se crearán dos sub-issues: Guión y Grabación');
    if (d.madre && !/^(no|ninguno|n\/a|-)$/i.test(d.madre)) {
      var m = String(d.madre).match(/([A-Za-z]{2,}-\d+)/);
      if (m) lines.push('• Colgada de: ' + m[1].toUpperCase());
    }
    if (d.guion) lines.push('• Guión: ' + d.guion);
    if (d.grabacion) lines.push('• Grabación: ' + d.grabacion);
    return {
      step: 'resumen',
      progress: progress(config, state),
      text: lines.join('\n'),
      buttons: [
        { label: 'Crear en Linear', value: '/crear' },
        { label: 'Cancelar', value: '/cancelar' },
      ],
      done: false,
    };
  }

  // ---------------------------------------------------------------- entrada

  /**
   * Comando que arranca la conversación.
   * Exige la barra a propósito: en una sala compartida, "video de ayer"
   * no debe despertar al bot.
   */
  function isStart(text) {
    return /^\s*\/video\b/i.test(String(text || ''));
  }

  function start(config) {
    var state = { step: null, data: {}, loops: [], startedAt: null };
    var next = nextStep(config, state);
    state.step = next ? next.id : 'resumen';
    return { state: state, reply: state.step === 'resumen' ? buildSummary(config, state) : questionMessage(config, state) };
  }

  function goBack(config, state) {
    var list = applicable(config, state);
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === state.step) idx = i;
    if (state.step === 'resumen') idx = list.length - 1;
    if (idx <= 0) return start(config);
    state.step = list[idx - 1].id;
    return { state: state, reply: questionMessage(config, state) };
  }

  /**
   * Procesa lo que escribió (o tocó) la persona.
   * input: { text } o { action: 'valor del botón' }
   */
  function input(config, state, inp, opts) {
    opts = opts || {};
    var today = opts.today || toISO(new Date());
    var raw = String((inp && (inp.text !== undefined ? inp.text : inp.action)) || '').trim();

    if (/^(\/cancelar|cancelar|salir|stop)$/i.test(raw)) {
      return { state: null, reply: { cancelled: true, text: 'Listo, cancelado. No se creó nada.', buttons: [] } };
    }
    if (/^(\/atras|atrás|volver|back)$/i.test(raw)) {
      return goBack(config, state);
    }

    if (state.step === 'resumen') {
      if (/^(\/crear|crear|sí|si|confirmar|ok)$/i.test(raw)) {
        return { state: state, reply: { ready: true, payload: toPayload(config, state, opts), text: 'Creando el issue…', buttons: [] } };
      }
      return { state: state, reply: buildSummary(config, state) };
    }

    var step = currentStep(config, state);
    if (!step) return start(config);

    // "Más opciones": muestra la lista completa
    if (raw === '/todas' && step.options) {
      return {
        state: state,
        reply: {
          step: step.id,
          progress: progress(config, state),
          text: '**' + step.q + '**\nOpciones:\n' + step.options(config).map(function (o) { return '• ' + o; }).join('\n'),
          buttons: step.options(config).map(function (o) { return { label: o, value: o }; }),
          done: false,
        },
      };
    }

    // Loops: alternar
    if (step.id === 'loops' && raw.indexOf('loop|') === 0) {
      var value = raw.slice(5);
      if (value === 'listo') {
        var errL = step.validate('', state);
        if (errL) {
          return { state: state, reply: withError(config, state, errL) };
        }
        return advance(config, state, today);
      }
      var idx = state.loops.indexOf(value);
      if (idx === -1) state.loops.push(value);
      else state.loops.splice(idx, 1);
      return { state: state, reply: questionMessage(config, state) };
    }

    // Salto de campos opcionales
    if (step.optional && /^(saltar|skip|\/saltar)s*$/i.test(raw)) {
      state.data[step.id] = '';
      return advance(config, state, today);
    }

    // Normalizar opciones (sin importar mayúsculas ni tildes)
    if (step.options) {
      var norm = function (s) {
        return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
      };
      var match = null;
      var all = step.options(config);
      for (var i = 0; i < all.length; i++) if (norm(all[i]) === norm(raw)) { match = all[i]; break; }
      if (!match && step.id === 'version') {
        for (var j = 0; j < all.length; j++) if (norm(all[j]).indexOf(norm(raw)) === 0) { match = all[j]; break; }
      }
      if (!match) {
        return { state: state, reply: withError(config, state, 'No reconocí esa opción. Toca una de las que aparecen abajo.') };
      }
      raw = match;
    }

    if (step.validate) {
      var err = step.validate(raw, state, today);
      if (err) return { state: state, reply: withError(config, state, err) };
    }

    if (step.id === 'fecha') state.data.fecha = parseFecha(raw, today);
    else if (step.id === 'cantidad') state.data.cantidad = Number(raw);
    else if (step.id === 'pantallas_yn') state.data.pantallas_yn = 'Sí';
    else state.data[step.id] = raw;

    return advance(config, state, today);
  }

  function withError(config, state, msg) {
    var m = questionMessage(config, state);
    m.error = msg;
    m.text = '⚠️ ' + msg + '\n\n' + m.text;
    return m;
  }

  function advance(config, state, today) {
    var next = nextStep(config, state);
    if (!next) {
      state.step = 'resumen';
      return { state: state, reply: buildSummary(config, state) };
    }
    state.step = next.id;
    return { state: state, reply: questionMessage(config, state) };
  }

  // ---------------------------------------------------------------- payload

  function toPayload(config, state, opts) {
    opts = opts || {};
    var d = state.data;
    var solicitante = opts.solicitante || {};
    var madre = d.madre && !/^(no|ninguno|n\/a|-)$/i.test(d.madre)
      ? String(d.madre).match(/([A-Za-z]{2,}-\d+)/)
      : null;

    return {
      idempotencyKey: opts.idempotencyKey || ('chat-' + (opts.chatId || '') + '-' + (opts.userId || '') + '-' + (state.startedAt || Date.now())),
      solicitante: { nombre: solicitante.nombre || '', email: solicitante.email || '' },
      titulo: d.titulo,
      objetivo: d.objetivo,
      contexto: d.contexto,
      version: d.version,
      canal: d.canal,
      icp: d.icp,
      formato: d.formato,
      duracion: d.duracion,
      cantidad: d.cantidad || 1,
      dueDate: d.fecha,
      aprobador: d.aprobador,
      loops: state.loops.slice(),
      pantallasDisponibles: d.pantallas_yn === 'Sí' ? 'yes' : null,
      refVis: null,
      links: { guion: d.guion || '', grabacion: d.grabacion || '', pantallas: d.pantallas_link || '', referencias: '' },
      parentIssue: madre ? madre[1].toUpperCase() : '',
    };
  }

  var Flow = {
    start: start,
    input: input,
    steps: steps,
    isStart: isStart,
    resolveAssignee: resolveAssignee,
    personName: personName,
    labelName: labelName,
    parseFecha: parseFecha,
    addDays: addDays,
    toPayload: toPayload,
    toISO: toISO,
    URL_RE: URL_RE,
    EMAIL_RE: EMAIL_RE,
  };
  return Flow;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = IntakeFlow;

// ===== linear-sync.js =====
/**
 * Cliente de Linear para el bot, escrito SIN promesas a propósito:
 * Google Apps Script ejecuta de forma síncrona y no soporta async/await.
 *
 * El transporte se inyecta:
 *   - En Google Apps Script: UrlFetchApp
 *   - En el test local: curl
 * Así el mismo código que corre en producción es el que se prueba.
 */
var IntakeLinear = (function () {
  'use strict';

  var ENDPOINT = 'https://api.linear.app/graphql';
  var transport = null;

  /** fn(url, {method, headers, body}) -> { status, text } */
  function setTransport(fn) { transport = fn; }

  function httpJson(apiKey, query, variables) {
    if (!transport) throw new Error('Transporte HTTP no configurado.');
    var res = transport(ENDPOINT, {
      method: 'post',
      headers: { 'Content-Type': 'application/json', Authorization: apiKey },
      body: JSON.stringify({ query: query, variables: variables || {} }),
    });
    var json;
    try {
      json = JSON.parse(res.text);
    } catch (e) {
      throw new Error('Linear devolvió algo que no es JSON (HTTP ' + res.status + ')');
    }
    if (res.status < 200 || res.status >= 300) {
      var msg = (json.errors || []).map(function (e) { return e.message; }).join(' | ');
      throw new Error('Linear HTTP ' + res.status + ': ' + (msg || res.text.slice(0, 200)));
    }
    if (json.errors && json.errors.length) {
      throw new Error('Linear: ' + json.errors.map(function (e) { return e.message; }).join(' | '));
    }
    return json.data;
  }

  function teamContext(apiKey, teamId) {
    var labels = httpJson(apiKey,
      'query($t:String!){team(id:$t){labels(first:250){nodes{id name}}}}', { t: teamId }).team.labels.nodes;
    var states = httpJson(apiKey,
      'query($t:String!){team(id:$t){states(first:50){nodes{id name type}}}}', { t: teamId }).team.states.nodes;
    return { labels: labels, states: states };
  }

  function usersByEmail(apiKey, emails) {
    var data = httpJson(apiKey,
      'query($f:UserFilter){users(first:50,filter:$f){nodes{id name displayName email url}}}',
      { f: { email: { in: emails } } });
    var map = {};
    data.users.nodes.forEach(function (u) {
      if (u.email) map[u.email.toLowerCase()] = u;
    });
    return map;
  }

  function findDuplicate(apiKey, teamId, marker) {
    var data = httpJson(apiKey,
      'query($t:ID!,$q:String){issues(first:3,filter:{team:{id:{eq:$t}},description:{contains:$q}}){nodes{id identifier url}}}',
      { t: teamId, q: marker });
    return data.issues.nodes[0] || null;
  }

  function displayName(user) {
    if (!user) return null;
    if (user.name && String(user.name).indexOf('@') === -1) return user.name;
    return user.displayName || user.name || user.email;
  }

  function cleanLabel(config, name) {
    return (config.labelAliases && config.labelAliases[name]) || name;
  }

  function buildDescription(config, payload, opts) {
    var L = payload.links || {};
    var assets = [
      '- 📄 **Guión:** ' + (L.guion ? '[Abrir](' + L.guion + ')' : '_Se produce en el sub-issue "Guión"_'),
      '- 🎬 **Grabación:** ' + (L.grabacion ? '[Abrir](' + L.grabacion + ')' : '_Se produce en el sub-issue "Grabación"_'),
    ];
    if (L.pantallas) assets.push('- 🖥️ **Pantallas grabadas:** [Abrir](' + L.pantallas + ')');

    var lines = [
      '## 🎯 Objetivo',
      payload.objetivo,
      '',
      '## 📋 Contexto / brief',
      payload.contexto,
      '',
      '## 🎬 Formato y entrega',
      '- **Formato:** ' + payload.formato,
      '- **Duración objetivo:** ' + payload.duracion,
      '- **Cantidad de piezas:** ' + payload.cantidad,
      '- **Entrega de la edición:** ' + payload.dueDate,
      '',
      '## ⚙️ Información operativa',
      '- **Versión:** ' + payload.version,
      '- **Canal:** ' + payload.canal,
      '- **ICP:** ' + payload.icp,
      '- **Loops:** ' + payload.loops.join(', '),
      '- **Aprobador final:** ' + payload.aprobador,
      '- **Solicitante:** ' + (opts.mentionUrl ? opts.mentionUrl + ' (' + opts.solicitanteNombre + ')' : opts.solicitanteNombre),
      payload.parentIssue ? '- **Issue madre:** ' + payload.parentIssue : null,
      '',
      '## 📁 Assets',
      assets.join('\n'),
      '',
      '---',
      '*Creado desde Google Chat con el bot de intake · v' + config.version + '*',
      '<!-- intake:v' + config.version + ':' + payload.idempotencyKey + ' -->',
    ];
    return lines.filter(function (l) { return l !== null; }).join('\n');
  }

  /**
   * Crea el issue completo. Devuelve { identifier, url, assignee, subIssues, warnings }
   * o { duplicate: true, ... } si ese mismo envío ya existía.
   */
  function createIssue(config, payload, apiKey) {
    var marker = '<!-- intake:v' + config.version + ':' + payload.idempotencyKey + ' -->';
    var dup = findDuplicate(apiKey, config.team.id, marker);
    if (dup) return { duplicate: true, identifier: dup.identifier, url: dup.url };

    var warnings = [];
    var who = (payload.solicitante || {});

    // --- regla de asignación (se resuelve ANTES de consultar usuarios,
    //     porque hay que traer también el usuario del responsable) ---
    var rule = null;
    for (var i = 0; i < config.assigneeRules.length; i++) {
      var r = config.assigneeRules[i];
      var okV = !r.versions || r.versions.indexOf(payload.version) !== -1;
      var okC = !r.canales || r.canales.indexOf(payload.canal) !== -1;
      if (okV && okC) { rule = r; break; }
    }
    if (!rule) rule = { email: config.defaultAssignee, why: 'Sin dueño definido para esta combinación' };

    var emails = [];
    [who.email, config.defaultAssignee, rule.email].forEach(function (e) {
      if (e && emails.indexOf(e) === -1) emails.push(e);
    });

    var ctx = teamContext(apiKey, config.team.id);
    var users = usersByEmail(apiKey, emails);

    var assignee = users[rule.email.toLowerCase()] || null;
    var assigneeNote = rule.why;
    if (!assignee) {
      assignee = users[config.defaultAssignee.toLowerCase()] || null;
      if (assignee) {
        assigneeNote = 'El responsable calculado no está en Linear; se asignó a ' +
          (config.people[config.defaultAssignee] || {}).name;
        warnings.push(assigneeNote);
      } else {
        assigneeNote = 'Sin asignar: no se pudo resolver el responsable.';
        warnings.push(assigneeNote);
      }
    }

    // --- solicitante ---
    var solicitante = who.email ? users[String(who.email).toLowerCase()] : null;
    if (!solicitante && who.email) {
      warnings.push('No encontré ' + who.email + ' en Linear: no quedó mencionado ni suscrito.');
    }

    // --- labels ---
    var byName = {};
    ctx.labels.forEach(function (l) { if (!byName[l.name]) byName[l.name] = l; });
    var wanted = payload.loops.concat([payload.canal, payload.icp, payload.version]);
    var labelIds = [];
    var unmatched = [];
    var seen = {};
    wanted.forEach(function (n) {
      var name = cleanLabel(config, n);
      if (seen[name]) return;
      seen[name] = true;
      if (byName[name]) labelIds.push(byName[name].id);
      else unmatched.push(name);
    });
    if (unmatched.length) warnings.push('Labels que no existen en ' + config.team.key + ': ' + unmatched.join(', '));

    // --- estado ---
    var stateId = null;
    for (var s = 0; s < ctx.states.length; s++) if (ctx.states[s].name === config.initialState) stateId = ctx.states[s].id;

    var description = buildDescription(config, payload, {
      mentionUrl: solicitante ? solicitante.url : null,
      solicitanteNombre: who.nombre || 'sin nombre',
    });

    var input = {
      teamId: config.team.id,
      title: payload.titulo,
      description: description,
      dueDate: payload.dueDate,
    };
    if (assignee) input.assigneeId = assignee.id;
    if (labelIds.length) input.labelIds = labelIds;
    if (stateId) input.stateId = stateId;

    var created = httpJson(apiKey,
      'mutation($input:IssueCreateInput!){issueCreate(input:$input){success issue{id identifier url title}}}',
      { input: input }).issueCreate.issue;

    // --- comentario con mención ---
    var comment = solicitante
      ? solicitante.url + ' — solicitud creada desde Google Chat.\nSi el brief o los assets necesitan ajustes, comenta aquí antes de empezar la producción.'
      : 'Solicitud creada por ' + (who.nombre || 'una persona') + ' desde Google Chat.';
    if (warnings.length) comment += '\n\n**Para revisar:**\n' + warnings.map(function (w) { return '- ' + w; }).join('\n');

    httpJson(apiKey,
      'mutation($input:CommentCreateInput!){commentCreate(input:$input){success}}',
      { input: { issueId: created.id, body: comment } });

    if (solicitante) {
      try {
        httpJson(apiKey,
          'mutation($id:String!,$input:IssueUpdateInput!){issueUpdate(id:$id,input:$input){success}}',
          { id: created.id, input: { subscriberIds: [solicitante.id] } });
      } catch (e) {
        warnings.push('No se pudo suscribir al solicitante.');
      }
    }

    // --- sub-issues de Paid ---
    var subIssues = [];
    if (payload.canal === 'Paid') {
      config.paidSubIssues.forEach(function (spec) {
        var subDue = payload.dueDate;
        // 4 y 2 días antes, sin irse al pasado
        var p = payload.dueDate.split('-');
        var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
        d.setDate(d.getDate() - Math.abs(spec.diasAntes));
        var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
        var cand = y + '-' + m + '-' + dd;
        var hoy = new Date();
        var hoyIso = hoy.getFullYear() + '-' + ('0' + (hoy.getMonth() + 1)).slice(-2) + '-' + ('0' + hoy.getDate()).slice(-2);
        subDue = cand < hoyIso ? payload.dueDate : cand;

        var subDesc = [
          '## 🎯 Objetivo', payload.objetivo, '',
          '## ✅ Qué debe entregar este sub-issue', spec.entrega, '',
          '## 📋 Contexto / brief', payload.contexto, '',
          '**Issue madre:** ' + created.identifier + ' · ' + payload.canal + ' · ' + payload.version + ' · ' + payload.formato,
          '', '---',
          '*Sub-issue generado por el bot de intake (canal Paid).*',
        ].join('\n');

        var subInput = {
          teamId: config.team.id,
          title: spec.sufijo + ' — ' + payload.titulo,
          description: subDesc,
          parentId: created.id,
          dueDate: subDue,
        };
        if (assignee) subInput.assigneeId = assignee.id;
        if (stateId) subInput.stateId = stateId;

        try {
          var sub = httpJson(apiKey,
            'mutation($input:IssueCreateInput!){issueCreate(input:$input){success issue{id identifier url title}}}',
            { input: subInput }).issueCreate.issue;
          subIssues.push({ identifier: sub.identifier, url: sub.url, title: sub.title, dueDate: subDue });
        } catch (e) {
          warnings.push('No se pudo crear el sub-issue "' + spec.sufijo + '".');
        }
      });
    }

    return {
      identifier: created.identifier,
      url: created.url,
      assignee: {
        email: assignee ? assignee.email : null,
        name: (config.people[rule.email] || {}).name || displayName(assignee),
      },
      assigneeNote: assigneeNote,
      mentioned: Boolean(solicitante),
      subIssues: subIssues,
      warnings: warnings,
    };
  }

  var LinearSync = {
    setTransport: setTransport,
    createIssue: createIssue,
    teamContext: teamContext,
    usersByEmail: usersByEmail,
    buildDescription: buildDescription,
  };
  return LinearSync;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = IntakeLinear;
