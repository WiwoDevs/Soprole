'use strict';

/**
 * Rutas del SSO de Microsoft (Entra ID).
 * Activas solo cuando AUTH_MICROSOFT_ENABLED=true y las credenciales están
 * completas. Si no, devuelven un aviso amable y el usuario usa el login local.
 * Tras un inicio de sesión válido se entra al sitio (`/`), que está protegido
 * completamente por autenticación (intranet).
 */

const express = require('express');
const router = express.Router();
const ms = require('../auth/microsoft');
const { loginSession } = require('../middleware/auth');

// Vida útil de un intento de login. Pasado este plazo hay que volver a empezar:
// evita que un `state` quede indefinidamente vivo en la sesión.
const INTENTO_TTL_MS = 10 * 60 * 1000;

// Cuántos intentos simultáneos se toleran (varias pestañas de login a la vez).
const MAX_INTENTOS = 5;

function renderError(res, status, error) {
  return res.status(status).render('pages/login', {
    title: 'Iniciar sesión',
    error,
    ssoEnabled: ms.isConfigured(),
    localEnabled: true,
  });
}

/** Traduce los errores que Entra devuelve en el callback a algo legible. */
function mensajeDeEntra(code, description) {
  if (code === 'access_denied') {
    // Cubre tanto "el usuario canceló" como el rechazo por política.
    return 'Se canceló el inicio de sesión, o tu cuenta no tiene permiso para acceder a este sitio. Si crees que es un error, contacta a la Mesa de Ayuda.';
  }
  if (code === 'invalid_request' || code === 'unauthorized_client') {
    return 'Hay un problema de configuración del acceso con Microsoft. Avisa a la Mesa de Ayuda indicando la hora del intento.';
  }
  if (String(description || '').includes('AADSTS65001')) {
    return 'La aplicación necesita autorización de un administrador de Soprole para continuar.';
  }
  return 'No se pudo completar el inicio de sesión con Microsoft. Inténtalo de nuevo.';
}

// Inicia el flujo: redirige al login de Microsoft.
router.get('/login', async (req, res, next) => {
  const client = ms.getClient();
  if (!client) {
    return renderError(
      res,
      503,
      'El inicio de sesión con Microsoft aún no está configurado. Usa el acceso local.'
    );
  }

  try {
    const { CryptoProvider } = require('@azure/msal-node');
    const cryptoProvider = new CryptoProvider();

    // PKCE: aunque este es un cliente confidencial (tiene secreto), el código
    // viaja en la URL de retorno y puede quedar en logs de proxy corporativo.
    // El verifier nunca sale del servidor.
    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();

    // state + nonce anti-CSRF/anti-replay. Se guardan en una LISTA y no en una
    // sola clave: con una sola, abrir dos pestañas de login hacía que la
    // segunda pisara a la primera y la primera fallara sin explicación.
    const state = cryptoProvider.createNewGuid();
    const nonce = cryptoProvider.createNewGuid();

    const ahora = Date.now();
    const vigentes = (req.session.oauth || []).filter((i) => ahora - i.creado < INTENTO_TTL_MS);
    vigentes.push({ state, nonce, verifier, creado: ahora });
    req.session.oauth = vigentes.slice(-MAX_INTENTOS);

    const authUrl = await client.getAuthCodeUrl({
      scopes: ms.config.scopes,
      redirectUri: ms.config.redirectUri,
      state,
      nonce,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
    });

    // La sesión debe estar escrita ANTES de mandar al usuario a Microsoft, o
    // el callback no encontrará el state.
    req.session.save((err) => (err ? next(err) : res.redirect(authUrl)));
  } catch (err) {
    next(err);
  }
});

// Callback de Microsoft: intercambia el código por tokens y crea la sesión.
router.get('/redirect', async (req, res, next) => {
  const client = ms.getClient();
  if (!client) return res.redirect('/login');

  try {
    // 1) Entra puede responder con un error en vez de un código (el usuario
    //    canceló, o una política lo bloqueó). Antes esto caía en un 500.
    if (req.query.error) {
      console.warn('[auth] Entra devolvió un error:', req.query.error, req.query.error_description);
      return renderError(res, 403, mensajeDeEntra(req.query.error, req.query.error_description));
    }
    if (!req.query.code || !req.query.state) {
      return renderError(res, 400, 'La respuesta de Microsoft llegó incompleta. Inténtalo de nuevo.');
    }

    // 2) Buscar el intento que corresponde a este state y consumirlo.
    const intentos = req.session.oauth || [];
    const intento = intentos.find((i) => i.state === req.query.state);

    // Se sale ANTES de tocar la sesión: si se asignaba `oauth` primero, cada
    // GET anónimo a esta ruta pública creaba y persistía una sesión nueva.
    if (!intento) {
      return renderError(
        res,
        403,
        'La solicitud de inicio de sesión no es válida o expiró. Inténtalo de nuevo.'
      );
    }
    req.session.oauth = intentos.filter((i) => i.state !== req.query.state);
    if (Date.now() - intento.creado > INTENTO_TTL_MS) {
      return renderError(res, 403, 'El inicio de sesión demoró demasiado. Inténtalo de nuevo.');
    }

    // 3) Canje del código. El code_verifier prueba que quien canjea es quien inició.
    const tokenResponse = await client.acquireTokenByCode({
      code: req.query.code,
      scopes: ms.config.scopes,
      redirectUri: ms.config.redirectUri,
      codeVerifier: intento.verifier,
    });

    const claims = tokenResponse.idTokenClaims;

    // 4) El nonce se exige SIEMPRE. Antes la comprobación era
    //    `if (expected.nonce && ...)`, es decir, si el nonce faltaba la
    //    validación entera se saltaba: fallaba en abierto.
    if (!claims || claims.nonce !== intento.nonce) {
      console.warn('[auth] nonce inválido o ausente en el id_token');
      return renderError(res, 403, 'No se pudo validar la respuesta de Microsoft. Inténtalo de nuevo.');
    }

    // 5) Inquilino, audiencia, emisor y expiración.
    const motivo = ms.validateClaims(claims);
    if (motivo) {
      console.warn('[auth] id_token rechazado:', motivo);
      return renderError(res, 403, 'No se pudo validar la respuesta de Microsoft. Inténtalo de nuevo.');
    }

    // 6) Autorización por dominio de correo.
    const account = tokenResponse.account || {};
    const email = String(account.username || claims.preferred_username || '').toLowerCase();

    if (!email) {
      console.warn('[auth] el id_token no trae identificador de cuenta');
      return renderError(res, 403, 'No se pudo determinar tu cuenta. Contacta a la Mesa de Ayuda.');
    }

    // Los invitados externos (B2B) pueden traer un UPN cuyo dominio coincide
    // con el permitido: se rechazan de forma explícita, no por el filtro de dominio.
    if (ms.isGuestAccount(email, claims)) {
      console.warn('[auth] acceso denegado a cuenta invitada');
      return renderError(res, 403, 'Este sitio es solo para cuentas internas de Soprole.');
    }

    if (!ms.isEmailAllowed(email)) {
      console.warn('[auth] acceso denegado por dominio:', email.replace(/^[^@]+/, '***'));
      return renderError(res, 403, `La cuenta ${email} no está autorizada para acceder a este sitio.`);
    }

    // 7) Sesión. `oid` es el identificador estable del usuario en el tenant;
    //    preferred_username es MUTABLE (cambia si RR.HH. corrige un apellido)
    //    y Microsoft documenta que no debe usarse como clave.
    loginSession(
      req,
      res,
      {
        id: claims.oid || null,
        email,
        name: account.name || claims.name || email,
        provider: 'microsoft',
      },
      next
    );
  } catch (err) {
    next(err);
  }
});

// El cierre de sesión se maneja de forma unificada en /logout (src/routes/login.js),
// tanto para login local como para Microsoft.

module.exports = router;
