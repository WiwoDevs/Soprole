'use strict';

/**
 * Versionado de CSS y JS para invalidar la cache del navegador.
 * ---------------------------------------------------------------------------
 * El navegador cachea /css/styles.css y /js/main.js. Como el HTML se genera en
 * cada peticion pero esos archivos no, se daba un estado incoherente: la pagina
 * nueva ejecutando el JavaScript viejo, con fallos imposibles de explicar.
 *
 * Se anexa a la URL un sufijo derivado del CONTENIDO del archivo: mientras el
 * archivo no cambie la URL es identica (y la cache sigue sirviendo), y en
 * cuanto cambia una linea la URL cambia y el navegador vuelve a pedirlo.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..', 'public');
const cache = new Map();

function version(rutaPublica) {
  const relativa = rutaPublica.charAt(0) === '/' ? rutaPublica.slice(1) : rutaPublica;
  const archivo = path.join(RAIZ, relativa);
  try {
    const mtime = fs.statSync(archivo).mtimeMs;
    const enCache = cache.get(rutaPublica);
    if (enCache && enCache.mtime === mtime) return enCache.v;

    const v = crypto.createHash('sha1').update(fs.readFileSync(archivo)).digest('hex').slice(0, 8);
    cache.set(rutaPublica, { mtime, v });
    return v;
  } catch {
    return ''; // si el archivo no existe, se sirve la URL sin version
  }
}

/** Devuelve la ruta con su version: /js/main.js -> /js/main.js?v=1a2b3c4d */
function versionar(rutaPublica) {
  const v = version(rutaPublica);
  return v ? `${rutaPublica}?v=${v}` : rutaPublica;
}

module.exports = { versionar };
