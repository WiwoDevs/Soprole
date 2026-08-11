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
  // En minúsculas SIEMPRE: Entra emite los claims `tid` e `iss` con el GUID en
  // minúsculas. Si alguien pega el Directory ID con alguna mayúscula (copiado
  // de un correo o un ticket), la comparación exacta de validateClaims
  // rechazaría a TODOS los usuarios con el mensaje engañoso "el token proviene
  // de otro inquilino".
  tenantId: (process.env.AZURE_TENANT_ID || '').trim().toLowerCase(),
  clientId: process.env.AZURE_CLIENT_ID || '',
  clientSecret: process.env.AZURE_CLIENT_SECRET || '',
  redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/auth/redirect',
  postLogoutRedirectUri:
    process.env.AZURE_POST_LOGOUT_REDIRECT_URI || 'http://localhost:3000/',
  allowedDomains: (process.env.AUTH_ALLOWED_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean),
  // Solo identidad. NO se pide 'User.Read': es un permiso de Microsoft Graph
  // que no usamos y que, con el consentimiento de usuario restringido (lo
  // habitual en empresas), provoca AADSTS65001 para toda la organización.
  scopes: ['openid', 'profile', 'email'],
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Autoridades multi-inquilino: aceptan CUALQUIER cuenta Microsoft del mundo.
// Son lo que copian todos los tutoriales de MSAL y aquí serían un agujero.
const ALIAS_MULTITENANT = ['common', 'organizations', 'consumers'];

/** ¿Está completamente configurado y habilitado el SSO? */
function isConfigured() {
  if (!config.enabled) return false;
  if (!config.tenantId || !config.clientId || !config.clientSecret) return false;
  // Se exige un tenant concreto: esta es una intranet de UNA organización.
  if (ALIAS_MULTITENANT.includes(config.tenantId.toLowerCase())) return false;
  if (!GUID.test(config.tenantId)) return false;
  return true;
}

/**
 * Explica por qué el SSO no está activo. Se usa en el arranque para que un
 * error de configuración se vea en el log en vez de degradar en silencio.
 */
function configError() {
  if (!config.enabled) return 'AUTH_MICROSOFT_ENABLED no es true';
  if (!config.tenantId) return 'falta AZURE_TENANT_ID';
  if (ALIAS_MULTITENANT.includes(config.tenantId.toLowerCase()))
    return `AZURE_TENANT_ID no puede ser "${config.tenantId}" (autoridad multi-inquilino): usa el GUID del tenant de Soprole`;
  if (!GUID.test(config.tenantId)) return 'AZURE_TENANT_ID no tiene formato GUID';
  if (!config.clientId) return 'falta AZURE_CLIENT_ID';
  if (!config.clientSecret) return 'falta AZURE_CLIENT_SECRET';
  return null;
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

/**
 * ¿El correo pertenece a un dominio autorizado?
 *
 * Falla en CERRADO a propósito: si AUTH_ALLOWED_DOMAINS queda vacío por un
 * error de tipeo en el .env de producción, se deniega el acceso en vez de
 * abrir la intranet entera. Antes esta función devolvía true en ese caso.
 */
function isEmailAllowed(email) {
  if (!email) return false;
  if (config.allowedDomains.length === 0) return false;
  const domain = String(email).split('@')[1]?.toLowerCase();
  return Boolean(domain) && config.allowedDomains.includes(domain);
}

/**
 * Valida los claims del id_token contra lo que esperamos.
 *
 * MSAL NO hace esto: extractTokenClaims() es un JSON.parse del payload. Que no
 * verifique la firma es correcto por diseño (el token llega por un canal TLS
 * directo con el endpoint de token, OIDC §3.1.3.7), pero la comprobación de
 * emisor, audiencia, inquilino y expiración le toca a la aplicación.
 *
 * Devuelve null si todo está bien, o el motivo del rechazo.
 */
function validateClaims(claims) {
  if (!claims) return 'el id_token no trae claims';

  // Comparaciones normalizadas: los GUID pueden venir con distinta caja.
  if (String(claims.tid || '').toLowerCase() !== config.tenantId)
    return 'el token proviene de otro inquilino';

  // `aud` puede ser cadena o arreglo según el emisor.
  const audiencias = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiencias.map((a) => String(a).toLowerCase()).includes(config.clientId.toLowerCase()))
    return 'el token fue emitido para otra aplicación';

  const emisoresValidos = [
    `https://login.microsoftonline.com/${config.tenantId}/v2.0`,
    `https://sts.windows.net/${config.tenantId}/`,
  ];
  if (!emisoresValidos.includes(String(claims.iss || '').toLowerCase()))
    return 'el emisor del token no es el esperado';

  // La expiración se EXIGE. Antes, si el claim faltaba o no era número, la
  // condición completa era falsa y el token se aprobaba sin verificar vigencia:
  // el mismo patrón de fallo en abierto que se corrigió en el nonce.
  const ahora = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number') return 'el id_token no trae expiración';
  if (claims.exp < ahora - 60) return 'el token está expirado'; // 60 s de holgura de reloj

  return null;
}

/**
 * ¿Es una identidad EXTERNA invitada al tenant (B2B)?
 *
 * Un invitado trae el UPN con la forma `persona_gmail.com#EXT#@dominio.cl`. Si
 * el dominio por defecto del tenant coincide con el permitido, el filtro por
 * dominio lo dejaría pasar como si fuera interno: una invitación de Teams o
 * SharePoint se convertiría en acceso a la intranet. El claim `acct` vale 0
 * para miembros y 1 para invitados.
 */
function isGuestAccount(email, claims) {
  if (String(email || '').toUpperCase().includes('#EXT#')) return true;
  if (claims && claims.acct === 1) return true;
  return false;
}

module.exports = {
  config,
  isConfigured,
  configError,
  getClient,
  isEmailAllowed,
  validateClaims,
  isGuestAccount,
};
