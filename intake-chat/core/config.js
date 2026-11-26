/**
 * Configuración del bot de intake en Google Chat.
 *
 * Es la misma información que intake/public/config.json del formulario web.
 * El test (test/simulate.js) verifica que ambos no se desincronicen.
 */
(function (root) {
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

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  root.BOT_CONFIG = CONFIG;
})(this);
