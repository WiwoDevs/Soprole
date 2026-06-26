'use strict';

/**
 * Panel de administración (/admin).
 * Permite editar TODO el contenido del sitio: textos, imágenes, tarjetas,
 * testimonios, estadísticas, pestañas de roles y revisar los envíos de contacto.
 *
 * Autenticación: login local (bcrypt) mientras el SSO de Microsoft no esté
 * activo. Cuando se habilite el SSO, el botón "Iniciar con Microsoft" toma el
 * control sin tocar este archivo.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');

const router = express.Router();
const Content = require('../models/content');
const ms = require('../auth/microsoft');
const { requireAdmin } = require('../middleware/auth');

// --------------------------------------------------------------------------
// Subida de imágenes
// --------------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Tipos permitidos -> extensión segura en disco.
// SVG queda EXCLUIDO a propósito: puede contener <script> (XSS almacenado).
const ALLOWED_IMAGE_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // La extensión la decide el tipo validado, NO lo que envía el cliente,
    // para que el archivo nunca pueda servirse como .html/.svg ejecutable.
    const ext = ALLOWED_IMAGE_EXT[file.mimetype] || '.bin';
    const base = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 60) || 'img';
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    const ok = Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_EXT, file.mimetype);
    cb(ok ? null : new Error('Solo se permiten imágenes PNG, JPG, GIF o WEBP.'), ok);
  },
});

// Envuelve un middleware de multer para capturar sus errores (tipo/límite/tamaño)
// y exponerlos como req.uploadError en vez de propagar un 500 crudo.
function handleUpload(mw) {
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) req.uploadError = err.message || 'No se pudo subir el archivo.';
      next();
    });
  };
}

// Valida que :table sea una colección conocida ANTES de procesar la subida
// (evita que un 404 deje archivos huérfanos en disco).
function requireValidCollection(req, res, next) {
  if (!Content.COLLECTIONS[req.params.table]) {
    return res.status(404).send('Colección no encontrada');
  }
  next();
}

// --------------------------------------------------------------------------
// Rate limiting simple en memoria para el login (anti fuerza bruta).
// Para producción multi-instancia, sustituir por un store compartido (Redis).
// --------------------------------------------------------------------------
const loginAttempts = new Map(); // ip -> { count, first }
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function loginRateLimit(req, res, next) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (rec && now - rec.first < WINDOW_MS && rec.count >= MAX_ATTEMPTS) {
    return res.status(429).render('admin/login', {
      title: 'Iniciar sesión · Admin',
      error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.',
      ssoEnabled: ms.isConfigured(),
      layout: false,
    });
  }
  next();
}
function registerFailedLogin(req) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) loginAttempts.set(ip, { count: 1, first: now });
  else rec.count += 1;
}

// Mapa { contentKey -> '/uploads/archivo' } a partir de archivos subidos.
function filesByBracketKey(files, prefix) {
  const map = {};
  for (const f of files || []) {
    const m = f.fieldname.match(new RegExp(`^${prefix}\\[(.+)\\]$`));
    if (m) map[m[1]] = `/uploads/${f.filename}`;
  }
  return map;
}

// --------------------------------------------------------------------------
// Login local
// --------------------------------------------------------------------------
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.render('admin/login', {
    title: 'Iniciar sesión · Admin',
    error: null,
    ssoEnabled: ms.isConfigured(),
    layout: false,
  });
});

router.post('/login', loginRateLimit, express.urlencoded({ extended: true }), (req, res) => {
  const { email, password } = req.body;
  const adminEmail = Content.getSetting('admin_email');
  const hash = Content.getSetting('admin_password_hash');

  const okEmail = email && email.toLowerCase() === adminEmail.toLowerCase();
  const okPass = hash && bcrypt.compareSync(password || '', hash);

  if (!okEmail || !okPass) {
    registerFailedLogin(req);
    return res.status(401).render('admin/login', {
      title: 'Iniciar sesión · Admin',
      error: 'Correo o contraseña incorrectos.',
      ssoEnabled: ms.isConfigured(),
      layout: false,
    });
  }

  loginAttempts.delete(req.ip || 'unknown'); // login correcto: limpia el contador
  req.session.user = { email: adminEmail, name: 'Administrador', provider: 'local' };
  const returnTo = req.session.returnTo || '/admin';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// A partir de aquí todo requiere sesión.
router.use(requireAdmin);

// --------------------------------------------------------------------------
// Dashboard
// --------------------------------------------------------------------------
router.get('/', (req, res) => {
  res.render('admin/dashboard', {
    title: 'Panel · conTIgo',
    section: 'dashboard',
    counts: {
      news_cards: Content.listAll('news_cards').length,
      testimonials: Content.listAll('testimonials').length,
      stats: Content.listAll('stats').length,
      role_tabs: Content.listAll('role_tabs').length,
      submissions: Content.listSubmissions().length,
    },
    ssoEnabled: ms.isConfigured(),
  });
});

// --------------------------------------------------------------------------
// Edición de contenido escalar (textos e imágenes por página)
// --------------------------------------------------------------------------
function renderContent(req, res, extra = {}) {
  res.render('admin/content', {
    title: 'Textos e imágenes · Admin',
    section: 'content',
    groups: Content.getGroupedForAdmin(),
    saved: req.query.saved === '1',
    error: null,
    ...extra,
  });
}

router.get('/content', (req, res) => renderContent(req, res));

router.post('/content', handleUpload(upload.any()), (req, res) => {
  if (req.uploadError) {
    return res.status(400).render('admin/content', {
      title: 'Textos e imágenes · Admin',
      section: 'content',
      groups: Content.getGroupedForAdmin(),
      saved: false,
      error: req.uploadError,
    });
  }

  const fields = req.body.field || {};
  const uploads = filesByBracketKey(req.files, 'file');

  // Primero los textos, luego las imágenes subidas (estas tienen prioridad).
  for (const [key, value] of Object.entries(fields)) {
    Content.set(key, value);
  }
  for (const [key, value] of Object.entries(uploads)) {
    Content.set(key, value);
  }
  res.redirect('/admin/content?saved=1');
});

// --------------------------------------------------------------------------
// CRUD de colecciones (news_cards, testimonials, stats, role_tabs)
// --------------------------------------------------------------------------
const COLLECTION_LABELS = {
  news_cards: 'Tarjetas / Noticias',
  testimonials: 'Testimonios',
  stats: 'Estadísticas',
  role_tabs: 'Pestañas de roles',
};

function assertCollection(req, res) {
  const { table } = req.params;
  if (!Content.COLLECTIONS[table]) {
    res.status(404).send('Colección no encontrada');
    return null;
  }
  return table;
}

router.get('/collection/:table', (req, res) => {
  const table = assertCollection(req, res);
  if (!table) return;
  res.render('admin/collection-list', {
    title: `${COLLECTION_LABELS[table]} · Admin`,
    section: table,
    table,
    label: COLLECTION_LABELS[table],
    columns: Content.COLLECTIONS[table],
    rows: Content.listAll(table),
  });
});

router.get('/collection/:table/new', (req, res) => {
  const table = assertCollection(req, res);
  if (!table) return;
  res.render('admin/collection-edit', {
    title: `Nuevo · ${COLLECTION_LABELS[table]}`,
    section: table,
    table,
    label: COLLECTION_LABELS[table],
    columns: Content.COLLECTIONS[table],
    row: {},
    isNew: true,
  });
});

router.get('/collection/:table/:id/edit', (req, res) => {
  const table = assertCollection(req, res);
  if (!table) return;
  const row = Content.getRow(table, req.params.id);
  if (!row) return res.status(404).send('Registro no encontrado');
  res.render('admin/collection-edit', {
    title: `Editar · ${COLLECTION_LABELS[table]}`,
    section: table,
    table,
    label: COLLECTION_LABELS[table],
    columns: Content.COLLECTIONS[table],
    row,
    isNew: false,
  });
});

router.post('/collection/:table/:id?', requireValidCollection, handleUpload(upload.any()), (req, res) => {
  const table = req.params.table;
  const isNew = !req.params.id;

  // Si la subida falló (tipo/tamaño), re-renderiza el formulario con el error
  // en vez de devolver un 500 crudo y perder lo editado.
  if (req.uploadError) {
    const row = isNew
      ? { ...req.body }
      : { ...(Content.getRow(table, req.params.id) || {}), ...req.body };
    return res.status(400).render('admin/collection-edit', {
      title: `${isNew ? 'Nuevo' : 'Editar'} · ${COLLECTION_LABELS[table]}`,
      section: table,
      table,
      label: COLLECTION_LABELS[table],
      columns: Content.COLLECTIONS[table],
      row,
      isNew,
      error: req.uploadError,
    });
  }

  const data = { ...req.body };
  // Imágenes subidas en este formulario (campo file[<columna>]).
  const uploads = filesByBracketKey(req.files, 'file');
  for (const [col, urlPath] of Object.entries(uploads)) {
    data[col] = urlPath;
  }
  // Checkbox "active": presente => 1, ausente => 0.
  if (Content.COLLECTIONS[table].includes('active')) {
    data.active = req.body.active ? 1 : 0;
  }

  if (req.params.id) {
    Content.updateRow(table, req.params.id, data);
  } else {
    Content.createRow(table, data);
  }
  res.redirect(`/admin/collection/${table}`);
});

router.post('/collection/:table/:id/delete', (req, res) => {
  const table = assertCollection(req, res);
  if (!table) return;
  Content.deleteRow(table, req.params.id);
  res.redirect(`/admin/collection/${table}`);
});

// --------------------------------------------------------------------------
// Envíos del formulario de contacto
// --------------------------------------------------------------------------
router.get('/submissions', (req, res) => {
  res.render('admin/submissions', {
    title: 'Mensajes de contacto · Admin',
    section: 'submissions',
    rows: Content.listSubmissions(),
  });
});

module.exports = router;
