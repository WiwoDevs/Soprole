'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { requireAuth, requireAuthAsset, exposeUser } = require('./src/middleware/auth');
const ms = require('./src/auth/microsoft');

const loginRoutes = require('./src/routes/login');
const authRoutes = require('./src/routes/auth');
const publicRoutes = require('./src/routes/public');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Secreto de sesión: obligatorio (y robusto) en producción; default solo en dev.
const SESSION_SECRET = process.env.SESSION_SECRET || (IS_PROD ? '' : 'contigo-dev-secret');
// Valores de ejemplo que NUNCA deben llegar a producción. La comprobación de
// longitud sola no basta: el placeholder del .env.example mide 45 caracteres
// y la pasaba sin problemas.
const SECRETOS_DE_EJEMPLO = [
  'cambia-este-secreto-por-uno-largo-y-aleatorio',
  'contigo-dev-secret',
];
if (IS_PROD && (!SESSION_SECRET || SESSION_SECRET.length < 32)) {
  throw new Error(
    'SESSION_SECRET debe definirse con un valor largo y aleatorio (>= 32 caracteres) en producción.'
  );
}
if (IS_PROD && SECRETOS_DE_EJEMPLO.includes(SESSION_SECRET)) {
  throw new Error(
    'SESSION_SECRET sigue siendo el valor de ejemplo del .env.example. Genera uno propio.'
  );
}

// Detrás de un reverse proxy (Nginx, Cloud Run, IIS...) que termina TLS:
// permite que Express confíe en X-Forwarded-Proto para emitir la cookie `secure`.
if (IS_PROD) app.set('trust proxy', 1);

// --- Motor de vistas ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Parsers ---
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- Estáticos PÚBLICOS: solo lo que la pantalla de login necesita ---
// El CSS y el JS son necesarios antes de autenticar. Todo lo demás (fotos del
// equipo, el PDF del Marco Metodológico) pasa a exigir sesión más abajo: antes
// se servía la carpeta assets/ completa sin login y cualquiera con la URL
// descargaba el PDF interno de 34 MB.
app.use(express.static(path.join(__dirname, 'public'))); // css, js

// --- Sesión ---
// Store persistente: el MemoryStore por defecto pierde memoria, borra todas
// las sesiones en cada reinicio y no soporta más de un proceso.
const sessionStore = require('./src/session-store')(session);
if (!sessionStore) {
  console.warn('  ⚠ node:sqlite no disponible: las sesiones quedan en memoria (se pierden al reiniciar).');
}

app.use(
  session({
    name: 'contigo.sid', // no anunciar la tecnología con el nombre por defecto
    secret: SESSION_SECRET,
    store: sessionStore || undefined,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax', // el callback de Entra es un GET de nivel superior: 'lax' lo permite
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

// --- Imágenes y documentos, detrás de sesión ---
// Va DESPUÉS del middleware de sesión (si no, req.session no existe y todo
// daría 403). Los logos quedan públicos porque los usa la propia pantalla de
// login; el resto —fotos del equipo, el PDF del Marco Metodológico— exige
// sesión: antes se servía assets/ completa sin login.
const LOGOS_PUBLICOS = ['/Logo Contigo.png', '/Contigo.svg', '/CONTIGO SOPROLE LOGO.png'];
app.use('/assets', (req, res, next) => {
  let ruta;
  try {
    ruta = decodeURIComponent(req.path);
  } catch {
    return res.status(400).type('text/plain').send('400');
  }
  if (LOGOS_PUBLICOS.includes(ruta)) return next();
  return requireAuthAsset(req, res, next);
});
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// --- Medios pesados (video), SIEMPRE detrás de sesión ---
// Va después de la sesión y con su propio guardia (403, no redirect) para que
// <video> falle limpio si la sesión expira. express.static ya responde
// peticiones por rango (Range) de fábrica, que es lo que permite adelantar
// el video y lo que Safari en iOS exige para reproducir.
// La carpeta media/ está fuera del control de versiones (ver .gitignore) y NO
// se copia al build estático: en dist/ no hay login y publicar el master
// equivaldría a exponerlo. Ahí el video se sirve por enlace a SharePoint.
app.use(
  '/media',
  requireAuthAsset,
  express.static(path.join(__dirname, 'media'), {
    cacheControl: false,
    setHeaders: (res) => {
      // 'private': nunca 'public' en un recurso autenticado — un proxy
      // corporativo compartido podría cachearlo y servirlo sin sesión.
      res.setHeader('Cache-Control', 'private, max-age=604800');
    },
  })
);

// --- Rutas de autenticación (PÚBLICAS, antes del muro de sesión) ---
app.use('/', loginRoutes);   // /login, /logout (local)
app.use('/auth', authRoutes); // SSO Microsoft

// --- A partir de aquí, TODO el sitio exige sesión válida (intranet) ---
app.use(requireAuth);

// --- Rutas del sitio (protegidas) ---
app.use('/', publicRoutes);

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
// El stack solo se muestra si DEBUG_ERRORS=true (explícito); por defecto, mensaje genérico.
const SHOW_STACK = process.env.DEBUG_ERRORS === 'true';
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(err.status || 500)
    .send(SHOW_STACK ? `<pre>${err.stack}</pre>` : 'Ocurrió un error en el servidor.');
});

// --------------------------------------------------------------------------
// Guardia de arranque: falla en CERRADO ante una configuración inservible.
// Antes, con NODE_ENV=production y el .env de ejemplo, el servidor arrancaba
// con normalidad y NADIE podía entrar: el login local se desactiva solo (la
// contraseña por defecto se rechaza) y el SSO estaba apagado. Ningún aviso.
// --------------------------------------------------------------------------
const localHabilitado = require('./src/routes/login').localLoginEnabled;

// Con el SSO activo, una allowlist vacía deniega a TODOS (isEmailAllowed falla
// en cerrado a propósito). Se detecta al arrancar y no en el primer login real,
// que es la ruta que no se puede probar antes del go-live.
if (ms.isConfigured() && ms.config.allowedDomains.length === 0) {
  throw new Error(
    'AUTH_ALLOWED_DOMAINS está vacío y el SSO está activo: se denegaría el acceso a todas las cuentas. ' +
      'Define los dominios permitidos (por ejemplo: soprole.cl).'
  );
}

if (IS_PROD && !localHabilitado && !ms.isConfigured()) {
  throw new Error(
    'Configuración inservible: en producción no hay SSO de Microsoft activo NI login local ' +
      `(motivo del SSO: ${ms.configError() || 'desconocido'}). ` +
      'Nadie podría iniciar sesión. Define ADMIN_PASSWORD propia o completa las credenciales de Azure.'
  );
}

// Diagnóstico al arrancar: la configuración efectiva se ve en el log, no hay
// que exponerla en un endpoint HTTP para poder revisarla.
function bannerArranque() {
  const uriPuerto = (String(ms.config.redirectUri).match(/localhost:(\d+)/) || [])[1];
  console.log(`\n  conTIgo Soprole`);
  console.log(`  ► Sitio (requiere login):  http://localhost:${PORT}`);
  console.log(`  ► Login:  http://localhost:${PORT}/login`);
  console.log(`  ► Entorno: ${IS_PROD ? 'production' : 'development'}   ·   cookie secure: ${IS_PROD}`);
  console.log(`  ► Sesiones: ${sessionStore ? 'SQLite (persistente)' : 'memoria (NO apto para producción)'}`);
  console.log(`  ► Login local: ${localHabilitado ? 'disponible' : 'deshabilitado'}`);
  if (ms.isConfigured()) {
    console.log(`  ► SSO Microsoft: ACTIVO`);
    console.log(`     redirect URI: ${ms.config.redirectUri}`);
    console.log(`     dominios permitidos: ${ms.config.allowedDomains.join(', ') || '(ninguno — se denegará todo)'}`);
    if (uriPuerto && uriPuerto !== String(PORT)) {
      console.log(`     ⚠ El redirect URI apunta al puerto ${uriPuerto} pero el servidor escucha en ${PORT}.`);
      console.log(`       Microsoft responderá AADSTS50011 al volver del login.`);
    }
  } else {
    console.log(`  ► SSO Microsoft: inactivo (${ms.configError()})`);
  }
  console.log('');
}

app.listen(PORT, bannerArranque);

module.exports = app;
