'use strict';

/**
 * Middlewares de autenticación — VERSIÓN ESTÁTICA (intranet).
 * ---------------------------------------------------------------------------
 * En esta versión NO hay panel de administración: el inicio de sesión protege
 * TODO el sitio. Solo usuarios autenticados (Microsoft SSO cuando esté
 * configurado, o el login local de respaldo) pueden ver las páginas.
 *
 * La sesión se marca con `req.session.user` tras un login válido.
 */

/** Exige sesión válida para acceder a cualquier página protegida. */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // Recuerda a dónde quería ir para volver tras el login.
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

/** Expone el usuario actual a todas las vistas como `currentUser`. */
function exposeUser(req, res, next) {
  res.locals.currentUser = (req.session && req.session.user) || null;
  next();
}

module.exports = { requireAuth, exposeUser };
