'use strict';

/**
 * Middlewares y utilidades de autenticación — intranet conTIgo.
 * ---------------------------------------------------------------------------
 * No hay panel de administración: el inicio de sesión protege TODO el sitio.
 * Solo usuarios autenticados (SSO de Microsoft cuando esté configurado, o el
 * login local de respaldo) pueden ver las páginas.
 *
 * La sesión se marca con `req.session.user` tras un login válido, siempre a
 * través de `loginSession()` — nunca asignando `req.session.user` a mano, para
 * no reintroducir la fijación de sesión.
 */

// Páginas reales del sitio. Cualquier destino post-login se compara contra
// esta lista: si no está, se va a la portada.
const RUTAS_CONOCIDAS = ['/', '/proyectos', '/contacto'];

/**
 * Devuelve un destino interno seguro, o '/' si el candidato no lo es.
 *
 * No se filtra por prefijos (una lista negra de '//', '/\', '/%2f'… siempre se
 * queda corta): se resuelve contra un origen ficticio y solo se acepta si la
 * URL resultante NO escapó de él. Así '//evil.cl/x', '/\evil.cl' o
 * 'https:/evil.cl' quedan descartados por construcción.
 */
function safeReturnTo(candidato) {
  if (!candidato || typeof candidato !== 'string') return '/';

  const BASE = 'http://placeholder.invalid';
  let url;
  try {
    url = new URL(candidato, BASE);
  } catch {
    return '/';
  }
  if (url.origin !== BASE) return '/';

  const destino = url.pathname + url.search;
  return RUTAS_CONOCIDAS.includes(url.pathname) ? destino : '/';
}

/**
 * Crea la sesión autenticada de forma segura y redirige al destino.
 *
 * Regenera el identificador de sesión para cerrar la fijación de sesión: sin
 * esto, el id que el navegador ya tenía ANTES de autenticar sigue siendo
 * válido después (escenario real: un terminal compartido de planta).
 *
 * Cuidado al tocar esta función: `regenerate()` DESTRUYE los datos de la
 * sesión, así que todo lo que haya que conservar (el destino) se lee ANTES.
 * Y el redirect va dentro de `save()`: sin eso, con un store en disco el 302
 * puede adelantarse a la escritura y el síntoma es "a veces tengo que entrar
 * dos veces".
 */
function loginSession(req, res, user, next) {
  const destino = safeReturnTo(req.session && req.session.returnTo);

  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.user = user;
    req.session.save((err2) => {
      if (err2) return next(err2);
      res.redirect(destino);
    });
  });
}

/** Exige sesión válida para acceder a cualquier página protegida. */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  // Solo recordamos el destino de navegaciones normales (GET de documento).
  // Sin este filtro, cada imagen o petición suelta pisaba `returnTo` y creaba
  // una sesión nueva por cada visitante anónimo.
  // Solo se guarda si hay algo REAL que recordar: '/' es el destino por
  // defecto, así que escribirlo no aporta y, con un store persistente, cada
  // visita anónima a la portada dejaba una fila en disco durante 8 horas.
  if (req.method === 'GET' && req.accepts('html')) {
    const destino = safeReturnTo(req.originalUrl);
    if (destino !== '/') req.session.returnTo = destino;
  }
  return res.redirect('/login');
}

/**
 * Exige sesión para RECURSOS (video, documentos), no para páginas.
 * A diferencia de requireAuth, responde 403 en vez de redirigir: un <video> que
 * recibe un 302 hacia el HTML del login falla con un error de decodificación
 * opaco. Tampoco toca `returnTo`, para que una sesión que expira a mitad de
 * reproducción no deje al usuario aterrizando en el .mp4 crudo tras el login.
 */
function requireAuthAsset(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(403).type('text/plain').send('403 — Requiere iniciar sesión.');
}

/** Expone el usuario actual a todas las vistas como `currentUser`. */
function exposeUser(req, res, next) {
  res.locals.currentUser = (req.session && req.session.user) || null;
  next();
}

module.exports = { requireAuth, requireAuthAsset, exposeUser, safeReturnTo, loginSession };
