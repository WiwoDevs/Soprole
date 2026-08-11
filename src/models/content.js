'use strict';

/**
 * Modelo de contenido — VERSIÓN ESTÁTICA.
 * ---------------------------------------------------------------------------
 * El sitio ya no depende de una base de datos ni del CMS: todo el contenido
 * vive "congelado" en `src/content/content.json` (exportado desde la antigua
 * base SQLite, ver rama `con-cms`).
 *
 * Mantiene la MISMA API pública que consumían las rutas y vistas
 * (getAll, get, newsCards, testimonials, stats, roleTabs), de modo que las
 * plantillas EJS no necesitan cambios.
 *
 * Para actualizar textos o imágenes: editar `content.json` y reiniciar el
 * servidor (o re-exportar desde la rama con CMS).
 */

const data = require('../content/content.json');

// --------------------------------------------------------------------------
// Contenido escalar (clave -> valor)
// --------------------------------------------------------------------------
const content = data.content || {};

/** Devuelve el valor de una clave, o `fallback` si no existe. */
function get(key, fallback = '') {
  return Object.prototype.hasOwnProperty.call(content, key) ? content[key] : fallback;
}

/** Devuelve un objeto { clave: valor } con TODAS las claves, para las vistas. */
function getAll() {
  return { ...content };
}

// --------------------------------------------------------------------------
// Colecciones (réplica del filtrado/orden que hacía el CMS)
// --------------------------------------------------------------------------
function activeSorted(rows) {
  return (rows || [])
    .filter((r) => Number(r.active) === 1)
    .sort((a, b) => a.sort - b.sort || a.id - b.id);
}

function newsCards(page) {
  return activeSorted((data.news_cards || []).filter((r) => r.page === page));
}

function testimonials() {
  return activeSorted(data.testimonials);
}

function stats() {
  return activeSorted(data.stats);
}

function roleTabs() {
  return activeSorted(data.role_tabs);
}

/** Fotos del equipo que alimentan el carrusel de "Nuestro Team". */
function teamPhotos() {
  return activeSorted(data.team_photos);
}

module.exports = {
  get,
  getAll,
  newsCards,
  testimonials,
  stats,
  roleTabs,
  teamPhotos,
};
