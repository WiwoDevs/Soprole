# conTIgo · Soprole — versión ESTÁTICA

Sitio web del equipo de TI de Soprole (**conTIgo**) en su variante **estática**:
el contenido está **congelado** (sin base de datos ni CMS) y **todo el sitio
está protegido por inicio de sesión Microsoft (Azure AD / SSO)**, con un login
local de respaldo.

> 🔀 **Ramas del repositorio**
> - **`con-cms`** — versión con CMS: el contenido se edita desde `/admin` (Express + EJS + SQLite). El SSO protege el panel.
> - **`estatico`** — *(esta rama)* versión estática: contenido congelado en un archivo, sin BD ni `/admin`, y el SSO protege **el sitio completo**.
>
> Ambas comparten las mismas vistas y el mismo flujo de SSO Microsoft.

---

## 🚀 Puesta en marcha

Requisitos: **Node.js ≥ 18** (probado con Node 22 y 24).

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de entorno
cp .env.example .env        # luego edita .env

# 3. Levantar el servidor
npm start                   # o: npm run dev  (recarga en caliente)
```

- Sitio:  http://localhost:3000  → redirige al login si no hay sesión
- Login:  http://localhost:3000/login

**Acceso local de respaldo** (definido en `.env`):
`admin@soprole.cl` / `Cambiar.123` — cámbialo en `.env`.
En **producción** la contraseña por defecto se rechaza: define una propia o
activa el SSO de Microsoft.

> No hay paso de `seed` ni base de datos: el contenido ya viene incluido.

---

## 🗂️ Contenido congelado (sin base de datos)

Todo el texto, las imágenes y las colecciones (tarjetas, testimonios,
estadísticas, pestañas de roles) viven en un único archivo:

```
src/content/content.json
```

Fue **exportado desde la base de datos del CMS** (rama `con-cms`). El modelo
`src/models/content.js` lo lee y expone la misma API que antes
(`getAll`, `newsCards`, `testimonials`, `stats`, `roleTabs`), de modo que las
vistas EJS **no cambian**.

### Actualizar contenido

- **Edición puntual:** edita `src/content/content.json` y reinicia el servidor.
- **Re-exportar desde el CMS:** si el contenido se editó en la rama `con-cms`
  (vía `/admin`), vuelve a exportar el JSON desde esa rama y reemplaza el archivo.
- Las imágenes referenciadas viven en `assets/` (servidas en `/assets`).

---

## 🔐 Acceso: SSO Microsoft (Azure AD) + login local

**Todo el sitio exige sesión** (intranet). Hay dos vías:

1. **Microsoft SSO (producción).** Flujo OAuth2/OIDC ya implementado con MSAL
   (`src/auth/microsoft.js` + `src/routes/auth.js`). Inactivo hasta configurarlo.
2. **Login local de respaldo.** Correo + contraseña de `.env`
   (`ADMIN_EMAIL` / `ADMIN_PASSWORD`). Útil en desarrollo y mientras no esté el SSO.

### Activar el SSO de Microsoft

1. Registrar la aplicación en **Azure → App registrations**:
   - **Redirect URI (Web):** `https://TU-DOMINIO/auth/redirect`
   - **Permisos:** `openid`, `profile`, `email`, `User.Read`
   - Generar un **Client secret**.
2. Completar en `.env`:
   ```env
   AUTH_MICROSOFT_ENABLED=true
   AZURE_TENANT_ID=...
   AZURE_CLIENT_ID=...
   AZURE_CLIENT_SECRET=...
   AZURE_REDIRECT_URI=https://TU-DOMINIO/auth/redirect
   AUTH_ALLOWED_DOMAINS=soprole.cl
   ```
3. Reiniciar el servidor. El botón "Iniciar sesión con Microsoft" aparece
   automáticamente en el login. **No requiere cambios de código.**

> ℹ️ El SSO es *server-side* (cliente confidencial con *client secret*), por eso
> esta versión mantiene un proceso Node/Express en lugar de ser archivos HTML
> puros sobre un CDN.

---

## 🗺️ Páginas

| Ruta          | Contenido |
|---------------|-----------|
| `/`           | **Inicio**: hero, tarjetas, CTA, testimonios y video. |
| `/proyectos`  | **Proyectos**: Marco Metodológico, Capacitación, pestañas de roles y estadísticas. |
| `/contacto`   | Datos de contacto de la Mesa de Ayuda (sin formulario). |
| `/login`      | Inicio de sesión (local + Microsoft). |
| `/logout`     | Cierre de sesión. |

---

## 📁 Estructura del proyecto

```
.
├── assets/                  # Imágenes y logos (se sirven en /assets)
├── public/
│   ├── css/styles.css       # estilos del sitio
│   └── js/main.js           # menú móvil, tabs, reproductor de video
├── src/
│   ├── auth/microsoft.js    # SSO Microsoft (MSAL) — preparado
│   ├── content/content.json # CONTENIDO CONGELADO (exportado del CMS)
│   ├── middleware/auth.js    # requireAuth (protege todo el sitio) + exposeUser
│   ├── models/content.js    # lee content.json (misma API que el CMS)
│   └── routes/              # public.js, login.js (local), auth.js (Microsoft)
├── views/                   # plantillas EJS (pages, partials)
├── server.js                # punto de entrada Express
└── .env.example
```

---

## 🔌 Integraciones (opcionales)

En `.env`:

- `GOOGLE_ANALYTICS_ID` — inyecta Google Analytics si tiene valor.
- `META_PIXEL_ID` — inyecta Meta Pixel si tiene valor.

---

## 🌐 Despliegue

- El sitio corre en el puerto `PORT` (por defecto 3000) detrás del hosting/reverse-proxy.
- En producción: definir `NODE_ENV=production`, un `SESSION_SECRET` largo y
  aleatorio, y servir tras HTTPS (las cookies se marcan `secure` automáticamente).
- Con `NODE_ENV=production` y SSO inactivo, el login local **solo** funciona si
  defines una contraseña propia (la por defecto se rechaza).

---

## 🔒 Seguridad aplicada

- **`SESSION_SECRET` obligatorio en producción** (arranque falla si falta o es corto).
- **`trust proxy` en producción** para que la cookie `secure` funcione tras un reverse-proxy.
- **Cookie de sesión** `httpOnly` + `sameSite: 'lax'` + `secure` en producción.
- **Login local**: comparación en tiempo constante, rate-limit en memoria
  (8 intentos / 15 min) y rechazo de la contraseña por defecto en producción.
- **SSO**: el flujo OAuth incluye validación de `state` y `nonce` (anti-CSRF de login).

Pendiente recomendado al pasar a producción:

- **Store de sesión persistente** (Redis/`connect-sqlite3`) y **rate-limit compartido**
  si se corre en múltiples instancias.
- Considerar **helmet** para cabeceras de seguridad.
