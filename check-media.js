'use strict';

/**
 * check-media.js — Verifica que la carpeta media/ esté completa.
 * ---------------------------------------------------------------------------
 * media/ está fuera del control de versiones (ver .gitignore): NO viaja con el
 * despliegue y se sube al servidor por separado. El fallo típico de ese esquema
 * es publicar y descubrir en producción que faltan videos, porque un <video>
 * que no carga no rompe la página: simplemente se queda en negro.
 *
 * Este script compara lo que content.json referencia contra lo que hay en
 * disco, y termina con código 1 si falta algo. Correrlo en el servidor después
 * de subir los videos, ANTES de dar el sitio por publicado.
 *
 * Uso:  node check-media.js       (o  npm run check:media)
 */

const fs = require('fs');
const path = require('path');

const MEDIA = path.join(__dirname, 'media');
const data = require('./src/content/content.json');

// --------------------------------------------------------------------------
// 1. Todo lo que el contenido pide bajo /media/
// --------------------------------------------------------------------------
const referencias = new Map(); // nombre de archivo -> [dónde se usa]

function registrar(donde, url) {
  if (typeof url !== 'string' || !url.startsWith('/media/')) return;
  // Las rutas van URL-encoded: /media/Video%20Soprole.mp4 -> "Video Soprole.mp4"
  let archivo;
  try {
    archivo = decodeURIComponent(url.slice('/media/'.length));
  } catch {
    archivo = url.slice('/media/'.length);
  }
  if (!referencias.has(archivo)) referencias.set(archivo, []);
  referencias.get(archivo).push(donde);
}

for (const [clave, valor] of Object.entries(data.content || {})) {
  registrar(clave, valor);
}
for (const col of ['role_tabs', 'team_slides', 'news_cards', 'testimonials']) {
  (data[col] || []).forEach((fila, i) => {
    const etiqueta = fila.label || fila.name || fila.title || `#${fila.id ?? i + 1}`;
    registrar(`${col}: ${etiqueta}`, fila.video);
    registrar(`${col}: ${etiqueta}`, fila.poster);
  });
}

// --------------------------------------------------------------------------
// 2. Lo que hay en disco
// --------------------------------------------------------------------------
if (!fs.existsSync(MEDIA)) {
  console.error(`\n  ✗ No existe la carpeta media/  (${MEDIA})`);
  console.error(`    El contenido referencia ${referencias.size} archivos. Súbelos ahí.\n`);
  process.exit(1);
}

const enDisco = new Set(fs.readdirSync(MEDIA).filter((f) => !f.startsWith('.')));

const faltan = [];
const presentes = [];
for (const [archivo, usos] of referencias) {
  if (enDisco.has(archivo)) {
    presentes.push([archivo, fs.statSync(path.join(MEDIA, archivo)).size]);
  } else {
    faltan.push([archivo, usos]);
  }
}
const sobran = [...enDisco].filter((f) => !referencias.has(f));

// --------------------------------------------------------------------------
// 3. Informe
// --------------------------------------------------------------------------
const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';
const total = presentes.reduce((s, [, b]) => s + b, 0);

console.log(`\n  media/  →  ${MEDIA}`);
console.log(`  Referenciados en content.json: ${referencias.size}`);
console.log(`  Presentes: ${presentes.length}  (${mb(total)})`);

// Un archivo de 0 bytes es una subida cortada: existe, pero no reproduce.
const vacios = presentes.filter(([, b]) => b === 0);
if (vacios.length) {
  console.log(`\n  ⚠ ${vacios.length} archivo(s) de 0 bytes (subida incompleta):`);
  vacios.forEach(([f]) => console.log(`      ${f}`));
}

if (sobran.length) {
  console.log(`\n  · ${sobran.length} archivo(s) en media/ que nadie referencia:`);
  sobran.forEach((f) => console.log(`      ${f}`));
}

if (faltan.length) {
  console.error(`\n  ✗ FALTAN ${faltan.length} archivo(s):\n`);
  faltan.forEach(([archivo, usos]) => console.error(`      ${archivo}\n          usado en: ${usos.join(', ')}`));
  console.error('');
  process.exit(1);
}

if (vacios.length) process.exit(1);

console.log('\n  ✓ media/ está completa.\n');
