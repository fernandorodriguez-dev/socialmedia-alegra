/**
 * Página web del intake (plan B): se publica como "Web app" de Apps Script y
 * NO depende de la configuración del Chat API. La persona abre la URL, llena
 * el formulario y el issue se crea en Linear igual que con el bot.
 *
 * Reutiliza los mismos globals que el bot: BOT_CONFIG, IntakeLinear, _apiKey,
 * _transporteUrlFetch (definidos en libreria.gs y Code.gs).
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Intake TMD — pedir pieza')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function crearIssue(payload) {
  IntakeLinear.setTransport(_transporteUrlFetch);

  var faltan = [];
  ['titulo', 'objetivo', 'contexto', 'version', 'canal', 'icp', 'formato', 'duracion', 'aprobador', 'dueDate']
    .forEach(function (k) { if (!payload || !payload[k]) faltan.push(k); });
  if (!payload.solicitante || !payload.solicitante.nombre) faltan.push('solicitanteNombre');
  if (!payload.solicitante || !payload.solicitante.email) faltan.push('solicitanteEmail');
  if (!payload.loops || !payload.loops.length) faltan.push('loops');

  if (payload.canal !== 'Paid' && !(payload.links && payload.links.guion)) faltan.push('guion');
  if (payload.canal !== 'Paid' && !(payload.links && payload.links.grabacion)) faltan.push('grabacion');
  if ((payload.loops || []).indexOf('Loop - Product') !== -1 && !(payload.links && payload.links.pantallas)) {
    faltan.push('pantallas');
  }

  if (faltan.length) {
    return { success: false, error: 'Faltan campos: ' + faltan.join(', ') };
  }

  try {
    return IntakeLinear.createIssue(BOT_CONFIG, payload, _apiKey());
  } catch (err) {
    return { success: false, error: err.message };
  }
}
