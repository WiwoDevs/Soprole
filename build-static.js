'use strict';

/**
 * build-static.js — Exporta el sitio a HTML 100% estático (sin Node, sin login).
 * ---------------------------------------------------------------------------
 * Renderiza las plantillas EJS con el mismo contenido de `content.json` y
 * escribe páginas .html planas + copia css/js/imágenes a la carpeta `dist/`.
 *
 * El resultado se sube por File Manager (zip) a cualquier servidor web
 * (Apache/Nginx/IIS) o hosting estático. No requiere Node en el servidor.
 *
 * Uso:  node build-static.js       (o  npm run build)
 */

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const Content = require('./src/models/content');

const ROOT = __dirname;
const VIEWS = path.join(ROOT, 'views');
const DIST = path.join(ROOT, 'dist');

// --- Helpers de contenido (réplica de server.js: esc + brandify) ---
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const brandify = (s) =>
  esc(s)
    .replace(/conTIgo/g, '<span class="brand-word">con<span class="brand-ti">TI</span>go</span>')
    .replace(/ConTIgo/g, '<span class="brand-word">Con<span class="brand-ti">TI</span>go</span>');

// Locals comunes a todas las vistas (sin usuario => sin botón de logout).
function baseLocals() {
  return {
    c: Content.getAll(),
    testimonials: Content.testimonials(),
    esc,
    brandify,
    currentUser: undefined, // sin sesión: la cabecera oculta "cerrar sesión"
    ssoConfigured: false,
    analyticsId: '',        // se puede activar poniendo el ID aquí
    metaPixelId: '',
    currentPath: '/',
  };
}

// Convierte rutas absolutas del servidor en rutas RELATIVAS (para que el sitio
// funcione dentro de cualquier subcarpeta del servidor, no solo en la raíz).
function toRelative(html) {
  return html
    .replace(/href="\/"/g, 'href="index.html"')
    .replace(/href="\/proyectos"/g, 'href="proyectos.html"')
    .replace(/href="\/contacto"/g, 'href="contacto.html"')
    // src/href/url() que apuntan a /assets, /css, /js  ->  relativos
    .replace(/(["'(])\/assets\//g, '$1assets/')
    .replace(/(["'(])\/css\//g, '$1css/')
    .replace(/(["'(])\/js\//g, '$1js/');
}

// Páginas a exportar: plantilla EJS + archivo de salida + locals propios.
const PAGES = [
  {
    template: 'pages/home.ejs',
    out: 'index.html',
    locals: { title: 'conTIgo · Soprole', active: 'home', cards: Content.newsCards('home') },
  },
  {
    template: 'pages/proyectos.ejs',
    out: 'proyectos.html',
    locals: {
      title: 'Proyectos · conTIgo Soprole',
      active: 'proyectos',
      stats: Content.stats(),
      roleTabs: Content.roleTabs(),
    },
  },
  {
    template: 'pages/contacto.ejs',
    out: 'contacto.html',
    locals: { title: 'Contacto · conTIgo Soprole', active: 'contacto' },
  },
];

async function build() {
  // 1) dist/ limpio
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // 2) Render de cada página
  for (const page of PAGES) {
    const file = path.join(VIEWS, page.template);
    const html = await ejs.renderFile(file, { ...baseLocals(), ...page.locals }, { root: VIEWS });
    fs.writeFileSync(path.join(DIST, page.out), toRelative(html), 'utf8');
    console.log('  ✓', page.out);
  }

  // 3) Copiar recursos estáticos
  //    assets/ (imágenes y logos)  +  css/  +  js/  (desde public/)
  fs.cpSync(path.join(ROOT, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'public', 'css'), path.join(DIST, 'css'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'public', 'js'), path.join(DIST, 'js'), { recursive: true });
  // Carpeta de subidas del CMS: no aplica en estático, se omite si existe.
  fs.rmSync(path.join(DIST, 'assets', 'public', 'uploads'), { recursive: true, force: true });
  console.log('  ✓ assets/  css/  js/');

  console.log('\n  Listo → carpeta dist/  (sube su CONTENIDO al directorio del servidor).');
}

build().catch((err) => {
  console.error('\n  ✗ Error en el build:', err);
  process.exit(1);
});
