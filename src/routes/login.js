'use strict';

/**
 * Login del sitio (intranet) — VERSIÓN ESTÁTICA.
 * ---------------------------------------------------------------------------
 * Puerta de entrada al sitio. Soporta dos vías:
 *
 *   1. Microsoft SSO (Azure AD): vía /auth/login (ver src/routes/auth.js).
 *      Es el método previsto para producción. Aparece automáticamente cuando
 *      AUTH_MICROSOFT_ENABLED=true y las credenciales de Azure están completas.
 *
 *   2. Login local de respaldo: correo + contraseña definidos en .env
 *      (ADMIN_EMAIL / ADMIN_PASSWORD). Útil en desarrollo y mientras el SSO de
 *      Microsoft no esté activo. En producción se rechaza la contraseña por
 *      defecto para no dejar el sitio abierto con credenciales conocidas.
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const ms = require('../auth/microsoft');

const IS_PROD = process.env.NODE_ENV === 'production';
const DEFAULT_PASSWORD = 'Cambiar.123';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

// El login local solo está disponible si hay credenciales y NO son la
// contraseña por defecto en producción.
const LOCAL_LOGIN_ENABLED =
  Boolean(ADMIN_EMAIL && ADMIN_PASSWORD) &&
  !(IS_PROD && ADMIN_PASSWORD === DEFAULT_PASSWORD);

// Comparación en tiempo constante (evita fugas por temporización).
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// --------------------------------------------------------------------------
// Rate limiting simple en memoria (anti fuerza bruta).
// Para producción multi-instancia, sustituir por un store compartido (Redis).
// --------------------------------------------------------------------------
const loginAttempts = new Map(); // ip -> { count, first }
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60 * 1000;

function isRateLimited(req) {
  const ip = req.ip || 'unknown';
  const rec = loginAttempts.get(ip);
  return Boolean(rec && Date.now() - rec.first < WINDOW_MS && rec.count >= MAX_ATTEMPTS);
}
function registerFailedLogin(req) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (!rec || now - rec.first > WINDOW_MS) loginAttempts.set(ip, { count: 1, first: now });
  else rec.count += 1;
}

function renderLogin(res, status, extra = {}) {
  return res.status(status).render('pages/login', {
    title: 'Iniciar sesión · conTIgo Soprole',
    error: null,
    ssoEnabled: ms.isConfigured(),
    localEnabled: LOCAL_LOGIN_ENABLED,
    ...extra,
  });
}

// --------------------------------------------------------------------------
// Rutas
// --------------------------------------------------------------------------
router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  renderLogin(res, 200);
});

router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  if (!LOCAL_LOGIN_ENABLED) {
    return renderLogin(res, 403, {
      error: 'El acceso local no está disponible. Inicia sesión con Microsoft.',
    });
  }
  if (isRateLimited(req)) {
    return renderLogin(res, 429, {
      error: 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.',
    });
  }

  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const okEmail = email && email === ADMIN_EMAIL;
  const okPass = safeEqual(password, ADMIN_PASSWORD);

  if (!okEmail || !okPass) {
    registerFailedLogin(req);
    return renderLogin(res, 401, { error: 'Correo o contraseña incorrectos.' });
  }

  loginAttempts.delete(req.ip || 'unknown'); // login correcto: limpia el contador
  req.session.user = { email: ADMIN_EMAIL, name: 'Equipo conTIgo', provider: 'local' };
  const returnTo = req.session.returnTo || '/';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

router.get('/logout', (req, res) => {
  const wasMicrosoft = req.session?.user?.provider === 'microsoft';
  req.session.destroy(() => {
    if (wasMicrosoft && ms.isConfigured()) {
      const url =
        `https://login.microsoftonline.com/${ms.config.tenantId}/oauth2/v2.0/logout` +
        `?post_logout_redirect_uri=${encodeURIComponent(ms.config.postLogoutRedirectUri)}`;
      return res.redirect(url);
    }
    res.redirect('/login');
  });
});

module.exports = router;
