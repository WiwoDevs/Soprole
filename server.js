'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { initSchema } = require('./src/db');
const { exposeUser } = require('./src/middleware/auth');
const ms = require('./src/auth/microsoft');

const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');
const authRoutes = require('./src/routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Secreto de sesión: obligatorio (y robusto) en producción; default solo en dev.
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PROD ? '' : 'contigo-dev-secret');
if (IS_PROD && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error(
    'SESSION_SECRET debe definirse con un valor largo y aleatorio (>= 32 caracteres) en producción.'
  );
}

// Detrás de un reverse proxy (Nginx, Cloud Run, IIS...) que termina TLS:
// permite que Express confíe en X-Forwarded-Proto para emitir la cookie `secure`.
if (IS_PROD) app.set('trust proxy', 1);

// Asegura que el esquema exista (idempotente).
initSchema();

// --- Motor de vistas ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Parsers ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Estáticos ---
app.use('/assets', express.static(path.join(__dirname, 'assets')));     // imágenes y logos entregados
// Archivos subidos: nunca dejar que el navegador "adivine" el tipo (evita XSS por sniffing).
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'public', 'uploads'), {
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  })
);
app.use(express.static(path.join(__dirname, 'public')));                 // css, js

// --- Sesión ---
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
      secure: IS_PROD,
    },
  })
);

// --- Variables disponibles en todas las vistas ---
app.use(exposeUser);
app.use((req, res, next) => {
  res.locals.ssoConfigured = ms.isConfigured();
  res.locals.analyticsId = process.env.GOOGLE_ANALYTICS_ID || '';
  res.locals.metaPixelId = process.env.META_PIXEL_ID || '';
  res.locals.currentPath = req.path;

  // Escapa HTML y resalta la marca "conTIgo" (con la "TI" destacada).
  res.locals.esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  res.locals.brandify = (s) =>
    res.locals
      .esc(s)
      .replace(/conTIgo/g, '<span class="brand-word">con<span class="brand-ti">TI</span>go</span>')
      .replace(/ConTIgo/g, '<span class="brand-word">Con<span class="brand-ti">TI</span>go</span>');
  next();
});

// --- Rutas ---
app.use('/', publicRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);

// --- 404 ---
app.use((req, res) => {
  res.status(404).render('pages/404', {
    title: 'Página no encontrada',
    active: '',
    c: require('./src/models/content').getAll(),
    testimonials: [],
  });
});

// --- Manejador de errores ---
// El stack solo se muestra si DEBUG_ERRORS=true (explícito); por defecto, mensaje genérico
// para no filtrar rutas internas ni versiones, aunque NODE_ENV no esté en 'production'.
const SHOW_STACK = process.env.DEBUG_ERRORS === 'true';
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .send(SHOW_STACK ? `<pre>${err.stack}</pre>` : 'Ocurrió un error en el servidor.');
});

app.listen(PORT, () => {
  console.log(`\n  conTIgo Soprole`);
  console.log(`  ► Sitio:  http://localhost:${PORT}`);
  console.log(`  ► Admin:  http://localhost:${PORT}/admin`);
  console.log(`  ► SSO Microsoft: ${ms.isConfigured() ? 'ACTIVO' : 'inactivo (login local)'}\n`);
});

module.exports = app;
