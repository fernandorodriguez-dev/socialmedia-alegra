// Regenera la librería para Apps Script.
// Une config + flow + linear-sync en un solo archivo y arregla cómo se
// exponen las variables globales: en Apps Script `this` arriba del archivo
// no apunta al espacio global, así que IntakeLinear/IntakeFlow quedaban
// invisibles para Code.gs. `globalThis` sí funciona en Google y en Node.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'core');
const FILES = ['config.js', 'flow.js', 'linear-sync.js'];

const ORIGINAL = '})(this);';
const FIXED = '})(typeof globalThis !== "undefined" ? globalThis : this);';

const partes = [];
for (const f of FILES) {
  const p = path.join(DIR, f);
  let src = fs.readFileSync(p, 'utf8');
  if (src.includes(ORIGINAL)) {
    src = src.replace(ORIGINAL, FIXED);
    fs.writeFileSync(p, src);
    console.log('arreglado', f);
  } else if (src.includes(FIXED)) {
    console.log('ya estaba', f);
  } else {
    throw new Error('no encontré el cierre esperado en ' + f);
  }
  partes.push('// ===== ' + f + ' =====\n' + src.trim() + '\n');
}

const cabecera = [
  '/**',
  ' * Librería del bot de intake — archivo único para pegar en Google Apps Script.',
  ' *',
  ' * GENERADO: no editar aquí. La fuente está en core/config.js, core/flow.js',
  ' * y core/linear-sync.js de este repositorio.',
  ' *',
  ' * Regenerar:  node scripts/build-libreria.js',
  ' */',
  '',
].join('\n');

const salida = path.join(__dirname, '..', 'libreria.gs');
fs.writeFileSync(salida, cabecera + partes.join('\n'));
console.log('escrito', salida, fs.statSync(salida).size, 'bytes');
