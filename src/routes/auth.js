'use strict';

/**
 * Rutas del SSO de Microsoft (Azure AD).
 * Activas solo cuando AUTH_MICROSOFT_ENABLED=true y las credenciales están
 * completas. Si no, devuelven un aviso amable y el usuario usa el login local.
 */

const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const ms = require('../auth/microsoft');

// Inicia el flujo: redirige al login de Microsoft.
router.get('/login', async (req, res, next) => {
  const client = ms.getClient();
  if (!client) {
    return res.status(503).render('admin/login', {
      title: 'Iniciar sesión',
      error: 'El inicio de sesión con Microsoft aún no está configurado. Usa el acceso local.',
      ssoEnabled: false,
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
  if (!client) return res.redirect('/admin/login');
  try {
    // Verifica el state contra la sesión (defensa CSRF) y consúmelo.
    const expected = req.session.oauth || {};
    delete req.session.oauth;
    if (!expected.state || req.query.state !== expected.state) {
      return res.status(403).render('admin/login', {
        title: 'Acceso denegado',
        error: 'La solicitud de inicio de sesión no es válida o expiró. Inténtalo de nuevo.',
        ssoEnabled: ms.isConfigured(),
      });
    }

    const tokenResponse = await client.acquireTokenByCode({
      code: req.query.code,
      scopes: ms.config.scopes,
      redirectUri: ms.config.redirectUri,
    });

    // Verifica el nonce del id_token (anti-replay/inyección OIDC).
    if (expected.nonce && tokenResponse.idTokenClaims?.nonce !== expected.nonce) {
      return res.status(403).render('admin/login', {
        title: 'Acceso denegado',
        error: 'No se pudo validar la respuesta de Microsoft (nonce). Inténtalo de nuevo.',
        ssoEnabled: ms.isConfigured(),
      });
    }

    const account = tokenResponse.account || {};
    const email = account.username || tokenResponse.idTokenClaims?.preferred_username || '';

    if (!ms.isEmailAllowed(email)) {
      return res.status(403).render('admin/login', {
        title: 'Acceso denegado',
        error: `La cuenta ${email} no está autorizada para este panel.`,
        ssoEnabled: ms.isConfigured(),
      });
    }

    req.session.user = {
      email,
      name: account.name || email,
      provider: 'microsoft',
    };
    const returnTo = req.session.returnTo || '/admin';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    next(err);
  }
});

// Cierre de sesión (local y/o Microsoft).
router.get('/logout', (req, res) => {
  const wasMicrosoft = req.session?.user?.provider === 'microsoft';
  req.session.destroy(() => {
    if (wasMicrosoft && ms.isConfigured()) {
      const url =
        `https://login.microsoftonline.com/${ms.config.tenantId}/oauth2/v2.0/logout` +
        `?post_logout_redirect_uri=${encodeURIComponent(ms.config.postLogoutRedirectUri)}`;
      return res.redirect(url);
    }
    res.redirect('/');
  });
});

module.exports = router;
