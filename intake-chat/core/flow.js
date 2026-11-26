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

  /**
   * Adivina los campos a partir de una descripción pegada tras /video.
   * Devuelve { data, loops }. No rellena título, objetivo ni contexto:
   * eso el bot lo pregunta siempre (son texto libre imposible de adivinar).
   */
  function parse(config, text, today) {
    var data = {};
    var loops = [];
    var t = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    var raw = String(text || '');

    function has(re) { return re.test(t); }

    // --- versión ---
    var versiones = {
      'colombia': 'COL', 'col': 'COL',
      'mexico': 'MEX', 'mex': 'MEX',
      'republica dominicana': 'DOM', 'rep dominicana': 'DOM', 'dominicana': 'DOM', 'dom': 'DOM',
      'costa rica': 'CRI', 'cri': 'CRI',
      'panama': 'PAN', 'espana': 'ESP', 'argentina': 'ARG', 'peru': 'PER', 'venezuela': 'VEN',
    };
    for (var k in versiones) if (t.indexOf(k) !== -1) data.version = versiones[k];
    if (!data.version) {
      var mc = raw.match(/\b(COL|MEX|DOM|CRI|PAN|ESP|ARG|PER|VEN|USA|ALL)\b/);
      if (mc) data.version = mc[1];
    }

    // --- canal ---
    if (has(/\breel|reels|vertical/)) data.canal = 'Social Media';
    else if (has(/\byoutube|\byt\b|horizontal/)) data.canal = 'YouTube';
    else if (has(/\bpaid|ads\b|publicidad/)) data.canal = 'Paid';
    else if (has(/\bacademy/)) data.canal = 'Academy';
    else if (has(/\blanding/)) data.canal = 'Landings';
    else if (has(/\bcontent hub|contenthub/)) data.canal = 'Content HUB';
    else if (has(/\bproducto\b/)) data.canal = 'Producto';
    else if (has(/\bapoyos?\b/)) data.canal = 'Apoyos';
    else if (has(/\bpdc\b/)) data.canal = 'PDC';

    // --- formato ---
    if (has(/\breel|9:16|vertical/)) data.formato = 'Reel 9:16';
    else if (has(/\b16:9|horizontal|youtube/)) data.formato = 'Video 16:9';
    else if (has(/\bcarrusel|4:5/)) data.formato = 'Carrusel 4:5';
    else if (has(/\bstory/)) data.formato = 'Story 9:16';

    // --- duración ---
    var dseg = t.match(/(\d{1,2})\s*(s|seg|segundos)/);
    if (dseg) data.duracion = dseg[1] + 's';
    else if (has(/\b4 ?min/)) data.duracion = '4 min';
    else if (has(/\b8\s*\+|\b8 ?min/)) data.duracion = '8+ min';
    else if (has(/\b2 ?min|\+2/)) data.duracion = '+2 min';
    else if (has(/\b1 ?min|60 ?s/)) data.duracion = '60s';
    else if (has(/\b90 ?s|1 ?: ?30/)) data.duracion = '90s';
    else if (has(/\b30 ?s/)) data.duracion = '30s';
    else if (has(/\b45 ?s/)) data.duracion = '45s';

    // --- cantidad ---
    var c = t.match(/(\d{1,2})\s*(piezas?|videos?|reels?)/);
    if (c) data.cantidad = Number(c[1]);

    // --- loops ---
    if (has(/\bbrand/)) loops.push('Loop - Brand');
    if (has(/\bhqc/)) loops.push('Loop - HQC');
    if (has(/\bevents?|eventos?/)) loops.push('Loop - Events');
    if (has(/\bproduct/)) loops.push('Loop - Product');
    if (has(/\bcontent ?hub/)) loops.push('Loop Content HUB');

    // --- icp ---
    if (has(/\bcontador|contadores/)) data.icp = 'Contador';
    else if (has(/\bpyme|pymes/)) data.icp = 'Pyme';
    else if (has(/\bempresa|empresas/)) data.icp = 'Empresa';

    // --- fecha ---
    if (has(/\bmanana/)) data.fecha = addDays(today, 1);
    else {
      var fen = t.match(/en\s+(\d{1,3})\s*dias?/);
      if (fen) data.fecha = addDays(today, Number(fen[1]));
      else {
        var fplus = t.match(/\+(\d{1,3})/);
        if (fplus) data.fecha = addDays(today, Number(fplus[1]));
        else {
          var fdm = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
          if (fdm) {
            var year = fdm[3] ? Number(fdm[3]) : Number(today.slice(0, 4));
            if (year < 100) year += 2000;
            data.fecha = year + '-' + pad(Number(fdm[2])) + '-' + pad(Number(fdm[1]));
          } else {
            var fiso = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
            if (fiso) data.fecha = fiso[1];
          }
        }
      }
    }

    return { data: data, loops: loops };
  }

  function recognizedText(config, parsed) {
    var d = parsed.data;
    var partes = [];
    if (d.version) partes.push(d.version);
    if (d.canal) partes.push(d.canal);
    if (d.formato) partes.push(d.formato);
    if (d.duracion) partes.push(d.duracion);
    if (d.cantidad) partes.push(d.cantidad + ' pieza(s)');
    if (parsed.loops.length) partes.push(parsed.loops.join(' + '));
    if (d.icp) partes.push('ICP ' + d.icp);
    if (d.fecha) partes.push('entrega ' + d.fecha);
    if (!partes.length) return '';
    return 'Entendí: **' + partes.join(' · ') + '**. Si algo está mal, me lo corriges cuando lo pregunte.';
  }

  function firstMissing(config, state) {
    var list = applicable(config, state);
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.id === 'loops') { if (!state.loops.length) return s; continue; }
      if (!state.data[s.id]) return s;
    }
    return null;
  }

  function startWithText(config, text, opts) {
    opts = opts || {};
    var today = opts.today || toISO(new Date());
    var p = parse(config, text, today);
    var state = { step: null, data: p.data, loops: p.loops, startedAt: Date.now() };
    var missing = firstMissing(config, state);
    state.step = missing ? missing.id : 'resumen';
    var nota = recognizedText(config, p);

    if (state.step === 'resumen') {
      var r = buildSummary(config, state);
      if (nota) r.text = nota + '\n\n' + r.text;
      return { state: state, reply: r };
    }
    var q = questionMessage(config, state);
    if (nota) q.text = nota + '\n\n' + q.text;
    return { state: state, reply: q };
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
    startWithText: startWithText,
    input: input,
    steps: steps,
    isStart: isStart,
    parse: parse,
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
