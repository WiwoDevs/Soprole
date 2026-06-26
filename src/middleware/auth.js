'use strict';

/**
 * Middlewares de autenticación para el panel de administración.
 * La sesión se marca con `req.session.user` tras un login válido
 * (local mientras el SSO de Microsoft no esté activo, o Microsoft cuando lo esté).
 */

function requireAdmin(req, res, next) {
  if (req.session && req.session.user) return next();
  // Recuerda a dónde quería ir para volver tras el login.
  req.session.returnTo = req.originalUrl;
  return res.redirect('/admin/login');
}

/** Expone el usuario actual a todas las vistas como `currentUser`. */
function exposeUser(req, res, next) {
  res.locals.currentUser = (req.session && req.session.user) || null;
  next();
}

module.exports = { requireAdmin, exposeUser };
