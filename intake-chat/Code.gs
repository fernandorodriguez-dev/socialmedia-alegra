/**
 * Bot de intake de TMD Content & Multimedia para Google Chat.
 *
 * Flujo: alguien escribe /video → el bot pregunta dato por dato → al final
 * crea el issue en Linear y responde en la sala con el enlace.
 *
 * Este archivo es solo el pegamento con Google Chat. La conversación vive en
 * core/flow.js y la creación en Linear en core/linear-sync.js, que se prueban
 * sin desplegar con `node test/simulate.js`.
 */

// ------------------------------------------------------------------ transporte

function _transporteUrlFetch(url, opts) {
  var res = UrlFetchApp.fetch(url, {
    method: opts.method || 'post',
    contentType: 'application/json',
    headers: opts.headers || {},
    payload: opts.body,
    muteHttpExceptions: true,
  });
  return { status: res.getResponseCode(), text: res.getContentText() };
}

/** La API key se guarda en Configuración del proyecto > Propiedades de secuencia de comandos */
function _apiKey() {
  var key = PropertiesService.getScriptProperties().getProperty('LINEAR_API_KEY');
  if (!key) throw new Error('Falta LINEAR_API_KEY en las propiedades del script.');
  return key;
}

function _hoy() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ------------------------------------------------------------------ estado

function _claveEstado(spaceName, email) {
  return 'estado|' + spaceName + '|' + email;
}

function _leerEstado(spaceName, email) {
  var raw = PropertiesService.getUserProperties().getProperty(_claveEstado(spaceName, email));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function _guardarEstado(spaceName, email, state) {
  var props = PropertiesService.getUserProperties();
  if (!state) props.deleteProperty(_claveEstado(spaceName, email));
  else props.setProperty(_claveEstado(spaceName, email), JSON.stringify(state));
}

// ------------------------------------------------------------------ mensajes

function _tarjeta(reply) {
  var widgets = [];
  if (reply.buttons && reply.buttons.length) {
    // máximo 6 botones por fila
    for (var i = 0; i < reply.buttons.length; i += 6) {
      var fila = reply.buttons.slice(i, i + 6).map(function (b) {
        return {
          text: b.label,
          onClick: { action: { function: 'alTocarBoton', parameters: [{ key: 'valor', value: b.value }] } },
        };
      });
      widgets.push({ buttonList: { buttons: fila } });
    }
  }

  return {
    text: reply.text,
    cardsV2: [{
      cardId: 'intake',
      card: {
        header: {
          title: 'Nueva pieza de contenido',
          subtitle: reply.progress ? 'Paso ' + reply.progress : 'TMD Content & Multimedia',
        },
        sections: widgets.length ? [{ widgets: widgets }] : [],
      },
    }],
  };
}

function _error(texto) {
  return { text: '⚠️ ' + texto };
}

function _confirmacion(res) {
  var widgets = [];
  if (res.url) {
    widgets.push({
      buttonList: {
        buttons: [{
          text: 'Abrir en Linear',
          onClick: { openLink: { url: res.url } },
        }],
      },
    });
  }

  var lineas = [
    '✅ **' + res.identifier + '** creado en Linear',
    'Asignado a: **' + (res.assignee.name || res.assignee.email) + '** _(' + res.assigneeNote + ')_',
  ];
  if (res.mentioned) lineas.push('Te mencioné y te suscribí: te llegan las respuestas del editor.');
  if (res.subIssues && res.subIssues.length) {
    lineas.push('');
    lineas.push('Sub-issues creados:');
    res.subIssues.forEach(function (s) {
      lineas.push('• ' + s.identifier + ' — ' + s.title + ' (vence ' + s.dueDate + ')');
    });
  }
  if (res.warnings && res.warnings.length) {
    lineas.push('');
    lineas.push('**Para revisar:**');
    res.warnings.forEach(function (w) { lineas.push('• ' + w); });
  }

  return {
    text: lineas.join('\n'),
    cardsV2: widgets.length ? [{ cardId: 'ok', card: { sections: [{ widgets: widgets }] } }] : [],
  };
}

// ------------------------------------------------------------------ eventos

function alRecibirMensaje(event) {
  try {
    var space = event.space && event.space.name ? event.space.name : (event.space && event.space.displayName) || 'dm';
    var user = event.user || {};
    var email = user.email || (user.name ? user.name + '@chat' : 'anonimo');
    var nombre = user.displayName || user.name || email;
    var texto = (event.message && event.message.text) || '';

    // arrancar
    if (IntakeFlow.isStart(texto)) {
      var inicio = IntakeFlow.start(BOT_CONFIG);
      inicio.state.startedAt = Date.now();
      _guardarEstado(space, email, inicio.state);
      return _tarjeta(inicio.reply);
    }

    var state = _leerEstado(space, email);
    if (!state) {
      return {
        text: 'Para pedir una pieza de contenido escribe **/video** y te voy preguntando dato por dato.',
      };
    }

    var out = IntakeFlow.input(BOT_CONFIG, state, { text: texto }, {
      today: _hoy(),
      solicitante: { nombre: nombre, email: user.email || '' },
      chatId: space,
      userId: email,
    });

    if (out.reply.cancelled) {
      _guardarEstado(space, email, null);
      return { text: 'Listo, cancelado. No se creó nada.' };
    }

    if (out.reply.ready) {
      _guardarEstado(space, email, null);
      var res = IntakeLinear.createIssue(BOT_CONFIG, out.reply.payload, _apiKey());
      return _confirmacion(res);
    }

    _guardarEstado(space, email, out.state);
    return _tarjeta(out.reply);
  } catch (err) {
    return _error(err.message);
  }
}

function alTocarBoton(event) {
  try {
    var space = event.space && event.space.name ? event.space.name : 'dm';
    var user = event.user || {};
    var email = user.email || (user.name ? user.name + '@chat' : 'anonimo');
    var nombre = user.displayName || user.name || email;

    var valor = '';
    var params = (event.action && event.action.parameters) || [];
    for (var i = 0; i < params.length; i++) {
      if (params[i].key === 'valor') valor = params[i].value;
    }

    var state = _leerEstado(space, email);
    if (!state) return { text: 'Esa conversación ya terminó. Escribe **/video** para empezar otra.' };

    var out = IntakeFlow.input(BOT_CONFIG, state, { action: valor }, {
      today: _hoy(),
      solicitante: { nombre: nombre, email: user.email || '' },
      chatId: space,
      userId: email,
    });

    if (out.reply.cancelled) {
      _guardarEstado(space, email, null);
      return { text: 'Listo, cancelado. No se creó nada.' };
    }

    if (out.reply.ready) {
      _guardarEstado(space, email, null);
      var res = IntakeLinear.createIssue(BOT_CONFIG, out.reply.payload, _apiKey());
      return _confirmacion(res);
    }

    _guardarEstado(space, email, out.state);
    return _tarjeta(out.reply);
  } catch (err) {
    return _error(err.message);
  }
}

/** Se ejecuta una vez a mano para comprobar la conexión con Linear. */
function probarConexionLinear() {
  IntakeLinear.setTransport(_transporteUrlFetch);
  var ctx = IntakeLinear.teamContext(_apiKey(), BOT_CONFIG.team.id);
  Logger.log('Labels del equipo: ' + ctx.labels.length);
  Logger.log('Estados: ' + ctx.states.map(function (s) { return s.name; }).join(', '));
  var users = IntakeLinear.usersByEmail(_apiKey(), [
    'ashley.mondragon@alegra.com', 'pablo.munoz@alegra.com',
    'katherine.rios@alegra.com', 'darwing.lopez@alegra.com', 'aura.fuentes@alegra.com',
  ]);
  Logger.log('Responsables encontrados: ' + Object.keys(users).length + ' de 5');
  return 'ok';
}

// el transporte se conecta al cargar
IntakeLinear.setTransport(_transporteUrlFetch);
