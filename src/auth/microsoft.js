'use strict';

/**
 * Integración SSO con Microsoft (Azure AD / Entra ID) usando MSAL.
 * ---------------------------------------------------------------------------
 * Estado: PREPARADO PARA CONECTAR.
 *
 * El flujo OAuth2 / OpenID Connect (Authorization Code) ya está escrito.
 * Mientras `AUTH_MICROSOFT_ENABLED` sea `false` (ver .env), permanece inactivo
 * y el sitio usa el login local del panel. Para activarlo, basta con:
 *
 *   1. Registrar la aplicación en Azure (App registrations).
 *      - Redirect URI (Web):  https://TU-DOMINIO/auth/redirect
 *      - Permisos:            openid, profile, email, User.Read
 *      - Generar un Client secret.
 *   2. Completar en .env: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
 *      AZURE_REDIRECT_URI y poner AUTH_MICROSOFT_ENABLED=true.
 *   3. Reiniciar el servidor. No se requiere ningún cambio de código.
 *
 * No se almacenan contraseñas: la identidad la gestiona Microsoft (AD corporativo).
 */

const ENABLED = String(process.env.AUTH_MICROSOFT_ENABLED).toLowerCase() === 'true';

const config = {
  enabled: ENABLED,
  tenantId: process.env.AZURE_TENANT_ID || '',
  clientId: process.env.AZURE_CLIENT_ID || '',
  clientSecret: process.env.AZURE_CLIENT_SECRET || '',
  redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/auth/redirect',
  postLogoutRedirectUri:
    process.env.AZURE_POST_LOGOUT_REDIRECT_URI || 'http://localhost:3000/',
  allowedDomains: (process.env.AUTH_ALLOWED_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

/** ¿Está completamente configurado y habilitado el SSO? */
function isConfigured() {
  return Boolean(
    config.enabled && config.tenantId && config.clientId && config.clientSecret
  );
}

/**
 * Devuelve una instancia de ConfidentialClientApplication de MSAL, creada de
 * forma perezosa para no exigir la librería ni credenciales si el SSO está off.
 */
let _cca = null;
function getClient() {
  if (!isConfigured()) return null;
  if (_cca) return _cca;

  // Carga diferida: solo si el SSO está activo.
  const { ConfidentialClientApplication, LogLevel } = require('@azure/msal-node');
  _cca = new ConfidentialClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
      clientSecret: config.clientSecret,
    },
    system: {
      loggerOptions: {
        loggerCallback: () => {},
        piiLoggingEnabled: false,
        logLevel: LogLevel.Warning,
      },
    },
  });
  return _cca;
}

/** ¿El correo pertenece a un dominio autorizado? (vacío => cualquiera del tenant) */
function isEmailAllowed(email) {
  if (!email) return false;
  if (config.allowedDomains.length === 0) return true;
  const domain = String(email).split('@')[1]?.toLowerCase();
  return config.allowedDomains.includes(domain);
}

module.exports = { config, isConfigured, getClient, isEmailAllowed };
