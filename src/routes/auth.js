'use strict';

/**
 * Rutas del SSO de Microsoft (Azure AD) — VERSIÓN ESTÁTICA.
 * Activas solo cuando AUTH_MICROSOFT_ENABLED=true y las credenciales están
 * completas. Si no, devuelven un aviso amable y el usuario usa el login local.
 * Tras un inicio de sesión válido se entra al sitio (`/`), que está protegido
 * completamente por autenticación (intranet).
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const ms = require('../auth/microsoft');

// Inicia el flujo: redirige al login de Microsoft.
router.get('/login', async (req, res, next) => {
  const client = ms.getClient();
  if (!client) {
    return res.status(503).render('pages/login', {
      title: 'Iniciar sesión',
      error: 'El inicio de sesión con Microsoft aún no está configurado. Usa el acceso local.',
      ssoEnabled: false,
      localEnabled: true,
    });
  }
  try {
    // Anti-CSRF de login (OAuth2/OIDC): state + nonce aleatorios guardados en sesión.
    const state = crypto.randomBytes(16).toString('hex');
    const nonce = crypto.randomBytes(16).toString('hex');
    req.session.oauth = { state, nonce };

    const authUrl = await client.getAuthCodeUrl({
      scopes: ms.config.scopes,
      redirectUri: ms.config.redirectUri,
      state,
      nonce,
    });
    res.redirect(authUrl);
  } catch (err) {
    next(err);
  }
});

// Callback de Microsoft: intercambia el código por tokens y crea la sesión.
router.get('/redirect', async (req, res, next) => {
  const client = ms.getClient();
  if (!client) return res.redirect('/login');
  try {
    // Verifica el state contra la sesión (defensa CSRF) y consúmelo.
    const expected = req.session.oauth || {};
    delete req.session.oauth;
    if (!expected.state || req.query.state !== expected.state) {
      return res.status(403).render('pages/login', {
        title: 'Acceso denegado',
        error: 'La solicitud de inicio de sesión no es válida o expiró. Inténtalo de nuevo.',
        ssoEnabled: ms.isConfigured(),
        localEnabled: true,
      });
    }

    const tokenResponse = await client.acquireTokenByCode({
      code: req.query.code,
      scopes: ms.config.scopes,
      redirectUri: ms.config.redirectUri,
    });

    // Verifica el nonce del id_token (anti-replay/inyección OIDC).
    if (expected.nonce && tokenResponse.idTokenClaims?.nonce !== expected.nonce) {
      return res.status(403).render('pages/login', {
        title: 'Acceso denegado',
        error: 'No se pudo validar la respuesta de Microsoft (nonce). Inténtalo de nuevo.',
        ssoEnabled: ms.isConfigured(),
        localEnabled: true,
      });
    }

    const account = tokenResponse.account || {};
    const email = account.username || tokenResponse.idTokenClaims?.preferred_username || '';

    if (!ms.isEmailAllowed(email)) {
      return res.status(403).render('pages/login', {
        title: 'Acceso denegado',
        error: `La cuenta ${email} no está autorizada para acceder a este sitio.`,
        ssoEnabled: ms.isConfigured(),
        localEnabled: true,
      });
    }

    req.session.user = {
      email,
      name: account.name || email,
      provider: 'microsoft',
    };
    const returnTo = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    next(err);
  }
});

// El cierre de sesión se maneja de forma unificada en /logout (src/routes/login.js),
// tanto para login local como para Microsoft.

module.exports = router;
