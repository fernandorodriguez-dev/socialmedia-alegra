'use strict';

const linear = require('./linear');

const URL_RE = /^https?:\/\/[^\s]+$/i;
const EMAIL_RE = /^[^\s@]+@alegra\.com$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

/** Regla de asignación: primera regla que coincide gana. Réplica exacta del navegador. */
function resolveAssignee(config, version, canal) {
  for (const rule of config.assigneeRules) {
    const okV = !rule.versions || rule.versions.includes(version);
    const okC = !rule.canales || rule.canales.includes(canal);
    if (okV && okC) return { email: rule.email, why: rule.why, ruleId: rule.id };
  }
  return {
    email: config.defaultAssignee,
    why: 'Sin dueño definido para esta combinación',
    ruleId: 'default',
  };
}

function validate(body, config) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });

  const s = body.solicitante || {};
  if (!String(s.nombre || '').trim()) err('solicitante-nombre', 'Escribe tu nombre.');
  const email = String(s.email || '').trim();
  if (!email) err('solicitante-email', 'Escribe tu correo de Alegra.');
  else if (!EMAIL_RE.test(email)) err('solicitante-email', 'Usa tu correo @alegra.com — sin él no puedo mencionarte en Linear.');

  if (!String(body.titulo || '').trim()) err('titulo', 'Falta el título.');
  if (String(body.titulo || '').trim().length > 180) err('titulo', 'El título pasa de 180 caracteres. Acórtalo.');
  if (!String(body.objetivo || '').trim()) err('objetivo', 'Falta el objetivo de la pieza.');
  if (!String(body.contexto || '').trim()) err('contexto', 'Falta el contexto / brief.');
  if (!body.version) err('version', 'Selecciona la versión.');
  if (!body.canal) err('canal', 'Selecciona el canal.');
  if (!body.icp) err('icp', 'Selecciona el ICP.');
  if (!body.formato) err('formato', 'Selecciona el formato de la pieza.');
  if (!body.duracion) err('duracion', 'Selecciona la duración objetivo.');
  if (!String(body.aprobador || '').trim()) err('aprobador', 'Indica el aprobador final.');

  const cantidad = Number(body.cantidad);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 50) {
    err('cantidad', 'La cantidad de piezas debe ser un número entre 1 y 50.');
  }

  const due = String(body.dueDate || '');
  if (!due) err('due-date', 'Define la fecha límite.');
  else if (!DATE_RE.test(due)) err('due-date', 'La fecha límite no tiene formato válido.');
  else if (due < todayISO()) err('due-date', 'La fecha límite ya pasó.');

  const loops = Array.isArray(body.loops) ? body.loops : [];
  if (loops.length === 0) err('loops', 'Selecciona al menos un Loop.');

  const isPaid = body.canal === 'Paid';
  const links = body.links || {};

  const checkLink = (field, label, required) => {
    const v = String(links[field] || '').trim();
    if (!v) {
      if (required) err(`link-${field}`, `Falta el link del ${label}.`);
      return;
    }
    if (!URL_RE.test(v)) err(`link-${field}`, `El link del ${label} debe empezar por https://`);
  };

  checkLink('guion', 'guión', !isPaid);
  checkLink('grabacion', 'grabación', !isPaid);

  const isProduct = loops.includes('Loop - Product');
  if (isProduct) {
    if (!body.pantallasDisponibles) {
      err('pantallas', 'Indica si las pantallas grabadas están disponibles (obligatorio con Loop - Product).');
    } else if (body.pantallasDisponibles === 'yes') {
      checkLink('pantallas', 'las pantallas grabadas', true);
    } else if (body.pantallasDisponibles === 'no') {
      err('pantallas', 'Con Loop - Product las pantallas grabadas son obligatorias.');
    }
  }

  const parentRaw = String(body.parentIssue || '').trim();
  let parentIdentifier = null;
  if (parentRaw) {
    const m = parentRaw.match(/([A-Za-z]{2,}-\d+)/);
    if (!m) err('parent-issue', 'No reconocí el issue madre. Pega el ID (ej. TMDCTMD-123) o el link completo.');
    else parentIdentifier = m[1].toUpperCase();
  }

  return { errors, isPaid, isProduct, links, loops, email: email.toLowerCase(), parentIdentifier, cantidad, dueDate: due };
}

function buildDescription(body, ctx, config, mention) {
  const { version, canal, icp, formato, duracion, cantidad, dueDate, loops, aprobador, notas } = body;
  const links = ctx.links;

  const assets = [
    `- 📄 **Guión:** ${links.guion ? `[Abrir](${links.guion})` : '_Se produce en el sub-issue "Guión"_'}`,
    `- 🎬 **Grabación:** ${links.grabacion ? `[Abrir](${links.grabacion})` : '_Se produce en el sub-issue "Grabación"_'}`,
    links.pantallas ? `- 🖥️ **Pantallas grabadas:** [Abrir](${links.pantallas})` : null,
    body.refVis === 'yes' ? '- 🎨 **Referencias visuales:** disponibles (ver otros links)' : null,
  ].filter(Boolean).join('\n');

  const lines = [
    '## 🎯 Objetivo',
    String(body.objetivo).trim(),
    '',
    '## 📋 Contexto / brief',
    String(body.contexto).trim(),
    '',
    '## 🎬 Formato y entrega',
    `- **Formato:** ${formato}`,
    `- **Duración objetivo:** ${duracion}`,
    `- **Cantidad de piezas:** ${cantidad}`,
    `- **Entrega de la edición:** ${dueDate}`,
    '',
    '## ⚙️ Información operativa',
    `- **Versión:** ${version}`,
    `- **Canal:** ${canal}`,
    `- **ICP:** ${icp}`,
    `- **Loops:** ${loops.join(', ')}`,
    `- **Aprobador final:** ${String(aprobador).trim()}`,
    mention ? `- **Solicitante:** ${mention.url} (${mention.nombre})` : `- **Solicitante:** ${body.solicitante.nombre} (sin usuario de Linear)`,
    ctx.parentIdentifier ? `- **Issue madre:** ${ctx.parentIdentifier}` : null,
    '',
    '## 📁 Assets',
    assets,
  ].filter((l) => l !== null);

  const referencias = String(links.referencias || '').trim();
  if (referencias) lines.push('', '## 🔗 Otros links', referencias);
  if (String(notas || '').trim()) lines.push('', '## 📝 Notas adicionales', String(notas).trim());

  lines.push(
    '',
    '---',
    `*Creado con el formulario de intake TMD · v${config.version} · ${todayISO()}*`,
    `<!-- intake:v${config.version}:${ctx.idempotencyKey} -->`
  );

  return lines.join('\n');
}

function cleanLabelName(name, config) {
  const aliases = config.labelAliases || {};
  return aliases[name] || name;
}

/** Linear devuelve `name` a veces como el correo; se elige la etiqueta más legible. */
function displayNameFor(user) {
  if (!user) return null;
  if (user.name && !String(user.name).includes('@')) return user.name;
  return user.displayName || user.name || user.email;
}

async function handleCreateIssue({ apiKey, config, body }) {
  const ctx = validate(body, config);
  if (ctx.errors.length) {
    return { status: 400, payload: { success: false, errors: ctx.errors } };
  }

  const idempotencyKey = String(body.idempotencyKey || '').trim() || `auto-${Date.now()}`;
  const assigneeInfo = resolveAssignee(config, body.version, body.canal);
  const client = linear.makeClient(apiKey);
  const gql = client.gql;

  const marker = `<!-- intake:v${config.version}:${idempotencyKey} -->`;

  // Idempotencia: si este envío ya creó un issue, devolvemos ese en lugar de duplicar.
  const existing = await linear.findDuplicate(gql, config.team.id, marker);
  if (existing) {
    return {
      status: 200,
      payload: {
        success: true,
        duplicate: true,
        issueId: existing.identifier,
        url: existing.url,
        assigneeEmail: assigneeInfo.email,
        message: 'Este formulario ya se había enviado: no se creó un issue nuevo.',
      },
    };
  }

  const wantedEmails = [assigneeInfo.email, ctx.email];
  const [teamCtx, users] = await Promise.all([
    linear.getTeamContext(gql, config.team.id),
    linear.getUsersByEmail(gql, wantedEmails),
  ]);

  // ---- asignación ----
  let assignee = users[assigneeInfo.email.toLowerCase()] || null;
  const warnings = [];
  let assigneeNote = assigneeInfo.why;
  if (!assignee) {
    const fallback = users[config.defaultAssignee.toLowerCase()] || null;
    if (fallback) {
      assignee = fallback;
      assigneeNote = `${assigneeInfo.email} no aparece en Linear; se asignó a ${config.people[config.defaultAssignee].name}.`;
      warnings.push(assigneeNote);
    } else {
      assigneeNote = 'Ningún responsable pudo resolverse; el issue queda sin asignar.';
      warnings.push(assigneeNote);
    }
  }

  // ---- solicitante ----
  const solicitanteUser = users[ctx.email] || null;
  const mention = solicitanteUser
    ? { url: solicitanteUser.url, nombre: displayNameFor(solicitanteUser) }
    : null;
  if (!mention) {
    warnings.push(`No encontré ${ctx.email} como usuario de Linear: la persona no quedó mencionada ni suscrita.`);
  }

  // ---- labels ----
  const byName = new Map();
  for (const l of teamCtx.labels) if (!byName.has(l.name)) byName.set(l.name, l);

  const requested = [
    ...ctx.loops,
    body.canal,
    body.icp,
    body.version,
  ].filter(Boolean).map((n) => cleanLabelName(n, config));

  const labelIds = [];
  const unmatchedLabels = [];
  for (const name of [...new Set(requested)]) {
    const found = byName.get(name);
    if (found) labelIds.push(found.id);
    else unmatchedLabels.push(name);
  }
  if (unmatchedLabels.length) {
    warnings.push(`No se aplicaron estos labels (no existen en ${config.team.key}): ${unmatchedLabels.join(', ')}`);
  }

  // ---- estado ----
  const state =
    teamCtx.states.find((s) => s.name === config.initialState) ||
    teamCtx.states.find((s) => s.type === 'unstarted') ||
    null;

  const description = buildDescription(body, { ...ctx, idempotencyKey, parentIdentifier: ctx.parentIdentifier }, config, mention);

  const issue = await linear.createIssue(gql, {
    teamId: config.team.id,
    title: String(body.titulo).trim(),
    description,
    ...(assignee && { assigneeId: assignee.id }),
    ...(ctx.dueDate && { dueDate: ctx.dueDate }),
    ...(labelIds.length && { labelIds }),
    ...(state && { stateId: state.id }),
  });

  // ---- comentario de trazabilidad (reemplaza el recordatorio genérico) ----
  const commentParts = [];
  if (mention) {
    commentParts.push(`${mention.url} — solicitud creada desde el formulario de intake.`);
  } else {
    commentParts.push(`Solicitud creada por ${body.solicitante.nombre} desde el formulario de intake.`);
  }
  commentParts.push('Si el brief o los assets necesitan ajustes, comenta aquí antes de empezar la producción.');
  if (warnings.length) {
    commentParts.push('', '**Para revisar:**', ...warnings.map((w) => `- ${w}`));
  }
  await linear.addComment(gql, issue.id, commentParts.join('\n'));

  // ---- suscripción del solicitante ----
  if (mention && solicitanteUser) {
    try {
      await linear.subscribe(gql, issue.id, solicitanteUser.id);
    } catch (e) {
      warnings.push('No se pudo suscribir al solicitante (el issue sí quedó creado).');
    }
  }

  // ---- sub-issues de Paid ----
  const subIssues = [];
  if (ctx.isPaid) {
    for (const spec of config.paidSubIssues) {
      let subDue = addDays(ctx.dueDate, -Math.abs(spec.diasAntes));
      if (subDue < todayISO()) subDue = ctx.dueDate;
      const subDesc = [
        `## 🎯 Objetivo`,
        String(body.objetivo).trim(),
        '',
        `## ✅ Qué debe entregar este sub-issue`,
        spec.entrega,
        '',
        '## 📋 Contexto / brief',
        String(body.contexto).trim(),
        '',
        `**Issue madre:** ${issue.identifier} · ${body.canal} · ${body.version} · ${body.formato}`,
        '',
        '---',
        `*Sub-issue generado automáticamente por el formulario de intake TMD (canal Paid).*`,
        `<!-- intake:v${config.version}:${idempotencyKey}:sub -->`,
      ].join('\n');

      try {
        const sub = await linear.createIssue(gql, {
          teamId: config.team.id,
          title: `${spec.sufijo} — ${String(body.titulo).trim()}`,
          description: subDesc,
          parentId: issue.id,
          ...(assignee && { assigneeId: assignee.id }),
          ...(subDue && { dueDate: subDue }),
          ...(state && { stateId: state.id }),
        });
        subIssues.push({ identifier: sub.identifier, url: sub.url, title: sub.title, dueDate: subDue });
      } catch (e) {
        warnings.push(`No se pudo crear el sub-issue "${spec.sufijo}": ${e.message}`);
      }
    }
  }

  return {
    status: 200,
    payload: {
      success: true,
      issueId: issue.identifier,
      url: issue.url,
      assigneeEmail: assignee ? assignee.email : null,
      assigneeName: (config.people[assigneeInfo.email] || {}).name || displayNameFor(assignee),
      assigneeReason: assigneeNote,
      solicitudBy: body.solicitante.nombre,
      mentioned: Boolean(mention),
      labelsApplied: labelIds.length,
      unmatchedLabels: unmatchedLabels.length ? unmatchedLabels : undefined,
      warnings: warnings.length ? warnings : undefined,
      subIssues: subIssues.length ? subIssues : undefined,
    },
  };
}

module.exports = { handleCreateIssue, resolveAssignee, validate, todayISO };
