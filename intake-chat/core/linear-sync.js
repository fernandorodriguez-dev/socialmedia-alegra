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
