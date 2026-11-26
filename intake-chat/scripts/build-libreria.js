// Regenera libreria.gs (archivo único para pegar en Apps Script) y normaliza
// cómo cada módulo de core/ se declara.
//
// Por qué: en Apps Script cada archivo .gs comparte un único espacio global y
// sólo las declaraciones `var Nombre = ...` de primer nivel se convierten en
// globales visibles desde los demás archivos. Ni `this` ni asignar a
// `globalThis` funcionan ahí. En Node sí sirve `module.exports`, así que se
// usan las dos salidas: `var` para Google y `module.exports` para las pruebas.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'core');

const MODULOS = {
  'config.js': { global: 'BOT_CONFIG', local: 'CONFIG' },
  'flow.js': { global: 'IntakeFlow', local: 'Flow' },
  'linear-sync.js': { global: 'IntakeLinear', local: 'LinearSync' },
};

const CIERRES_ANTIGUOS = [
  '})(this);',
  '})(typeof globalThis !== "undefined" ? globalThis : this);',
];

const partes = [];

for (const [archivo, { global, local }] of Object.entries(MODULOS)) {
  const p = path.join(DIR, archivo);
  let src = fs.readFileSync(p, 'utf8');

  // 1) cabecera: (function (root) {  ->  var GLOBAL = (function () {
  const cabVieja = '(function (root) {';
  if (src.includes(cabVieja)) {
    src = src.replace(cabVieja, `var ${global} = (function () {`);
  } else if (!src.includes(`var ${global} = (function () {`)) {
    throw new Error(`cabecera inesperada en ${archivo}`);
  }

  // 2) cola: quitar la asignación a root y cerrar devolviendo el módulo
  src = src.replace(new RegExp(`\\n\\s*root\\.${global} = ${local};`), '');
  src = src.replace(new RegExp(`\\n\\s*if \\(typeof module[^\\n]*module\\.exports = ${local};`), '');
  for (const cierre of CIERRES_ANTIGUOS) {
    src = src.replace(cierre, `  return ${local};\n})();\n\nif (typeof module !== 'undefined' && module.exports) module.exports = ${global};`);
  }

  // 3) comprobaciones
  if (!src.includes(`var ${global} = (function () {`)) throw new Error(`sin declaración global en ${archivo}`);
  if (!src.includes(`return ${local};`)) throw new Error(`sin return en ${archivo}`);
  if (src.includes('root.')) throw new Error(`quedó una referencia a root en ${archivo}`);
  if (!src.includes('})(this);') && !src.includes('})();')) throw new Error(`cierre raro en ${archivo}`);

  fs.writeFileSync(p, src);
  partes.push(`// ===== ${archivo} =====\n${src.trim()}\n`);
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
console.log('OK ·', salida, fs.statSync(salida).size, 'bytes');
console.log('globales declaradas:', Object.values(MODULOS).map((m) => m.global).join(', '));
