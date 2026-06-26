# conTIgo · Soprole

Sitio web del equipo de TI de Soprole (**conTIgo**), con secciones públicas y una
**capa de administración** para editar todo el contenido sin tocar código.
Construido en **Node.js + Express + EJS + SQLite**, con **inicio de sesión Microsoft
(Azure AD / SSO) preparado para conectar**.

---

## 🚀 Puesta en marcha

Requisitos: **Node.js ≥ 18** (probado con Node 22).

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de entorno
cp .env.example .env        # luego edita .env si quieres

# 3. Cargar el contenido inicial (textos de los mockups) y crear el admin
npm run seed

# 4. Levantar el servidor
npm start                   # o: npm run dev  (recarga en caliente)
```

- Sitio:  http://localhost:3000
- Admin:  http://localhost:3000/admin

**Credenciales del admin local** (definidas en `.env`):
`admin@soprole.cl` / `Cambiar.123` — cámbialas en `.env` y vuelve a correr `npm run seed`.

---

## 🗄️ Base de datos

El sitio usa **SQLite** (a través de `better-sqlite3`). Es una base de datos embebida
en un único archivo: **`data/contigo.db`**, que se crea automáticamente.

> ⚠️ **Importante:** ni la base de datos (`data/contigo.db`) ni el archivo `.env`
> están en el repositorio (están en `.gitignore`). Por eso, **después de clonar el
> proyecto hay que generarlos** con los pasos de abajo. Si no, el sitio arranca sin
> contenido o sin poder entrar al admin.

### Dejar la base de datos funcionando (desde cero / tras clonar)

```bash
npm install                 # instala dependencias (incluye el motor better-sqlite3)
cp .env.example .env        # crea tu .env (define ADMIN_EMAIL / ADMIN_PASSWORD, etc.)
npm run seed                # crea las tablas y carga el contenido inicial + el admin
npm start                   # levanta el sitio
```

Tras `npm run seed` ya existe `data/contigo.db` con todos los textos, imágenes,
tarjetas, testimonios y estadísticas, además del usuario administrador.

### Scripts de base de datos

| Comando            | Qué hace |
|--------------------|----------|
| `npm run seed`     | Crea el esquema si falta y **siembra solo lo que falte**. Respeta lo ya editado desde `/admin` (no pisa textos ni colecciones existentes). Seguro de correr varias veces. |
| `npm run reset-db` | **Borra todo el contenido** y lo vuelve a sembrar desde cero. Útil en desarrollo o si cambió la estructura de tablas. |

### ¿Qué crea el `seed`?

- Las tablas: `content` (textos e imágenes), `news_cards`, `testimonials`, `stats`,
  `role_tabs`, `submissions` (mensajes de contacto) y `settings`.
- El **usuario administrador local** (correo y contraseña tomados de `.env`).
- Todo el contenido inicial del sitio.

### Cambiar la contraseña o el correo del admin

Edita `ADMIN_EMAIL` / `ADMIN_PASSWORD` en `.env` y vuelve a correr `npm run seed`.
(En producción, el `seed` **no acepta** la contraseña por defecto: hay que definir una propia.)

### Notas técnicas

- `better-sqlite3` es un módulo **nativo**; `npm install` descarga el binario
  precompilado para tu versión de Node. Si la instalación fallara en Windows por
  compilación, instala las *build tools* (Visual Studio Build Tools + Python) y
  reinstala con `npm install`.
- La carpeta `data/` se crea sola en el primer arranque o al correr el `seed`.
- Migrar más adelante a **PostgreSQL/MySQL** solo afecta `src/db/` y
  `src/models/content.js`; las rutas y vistas no cambian.

---

## 🗺️ Páginas

| Ruta          | Contenido |
|---------------|-----------|
| `/`           | **Inicio**: hero "Si funciona, es porque estamos conTIgo / Con todas las personas, sistemas y procesos", 2 tarjetas, CTA de iniciativa, testimonios y video. |
| `/proyectos`  | **Proyectos**: Marco Metodológico, Capacitación, pestañas de roles y estadísticas. |
| `/contacto`   | Formulario de contacto / captación de leads. |

---

## 🛠️ Panel de administración (`/admin`)

Todo el contenido visible del sitio es editable:

- **Textos e imágenes** — todos los campos de cada página (con subida de imágenes).
- **Tarjetas / Noticias** — las del Home y las de "ConTIgo al día" (crear/editar/eliminar).
- **Testimonios** — citas de colaboradores.
- **Estadísticas** — los indicadores de la página Proyectos.
- **Pestañas de roles** — el contenido de "Rol 1…4" en Capacitación.
- **Mensajes de contacto** — bandeja con los leads recibidos.

Las imágenes subidas se guardan en `public/uploads/`.

---

## 🔐 Inicio de sesión con Microsoft (SSO) — listo para conectar

No se desarrolló un sistema propio de usuarios: la identidad la gestiona Microsoft
(AD corporativo). El flujo OAuth2/OIDC ya está implementado con **MSAL**
(`src/auth/microsoft.js` + `src/routes/auth.js`) y permanece **inactivo** hasta
que se configure. Para activarlo:

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
3. Reiniciar el servidor. **No se requiere ningún cambio de código.**
   El botón "Iniciar sesión con Microsoft" aparecerá automáticamente en el login.

Mientras el SSO esté inactivo, el panel usa el login local de `.env`.

---

## 📁 Estructura del proyecto

```
.
├── assets/                  # Imágenes y logos entregados (se sirven en /assets)
├── data/                    # Base de datos SQLite (se crea sola; ignorada por git)
├── public/
│   ├── css/                 # styles.css (sitio) + admin.css (panel)
│   ├── js/main.js           # menú móvil, tabs, reproductor de video
│   └── uploads/             # imágenes subidas desde el admin
├── src/
│   ├── auth/microsoft.js    # SSO Microsoft (MSAL) — preparado
│   ├── db/                  # conexión, schema.sql y seed (contenido inicial)
│   ├── middleware/auth.js   # protección de rutas del admin
│   ├── models/content.js    # única capa de acceso a datos
│   └── routes/              # public.js, admin.js, auth.js
├── views/                   # plantillas EJS (pages, partials, admin)
├── server.js                # punto de entrada Express
└── .env.example
```

---

## 🔌 Integraciones (opcionales)

En `.env`:

- `GOOGLE_ANALYTICS_ID` — inyecta Google Analytics si tiene valor.
- `META_PIXEL_ID` — inyecta Meta Pixel si tiene valor.

---

## 🌐 Despliegue / habilitación de seguridad corporativa

- El sitio corre en el puerto `PORT` (por defecto 3000) detrás del hosting/reverse-proxy.
- **IP pública:** debe entregarla el proveedor de hosting donde se publique
  (no es un valor del código). Coordinar con Soprole para habilitarla en los
  controles de seguridad corporativos.
- En producción: definir `NODE_ENV=production`, un `SESSION_SECRET` largo y
  aleatorio, y servir tras HTTPS (las cookies se marcan `secure` automáticamente).

---

## 📝 Notas técnicas

- **Base de datos:** SQLite (cero configuración). El acceso está aislado en
  `src/models/content.js` y `src/db/`, de modo que migrar a PostgreSQL/MySQL más
  adelante solo afecta esa capa.
- **Store de sesión:** en desarrollo se usa el store en memoria. Para producción
  conviene un store persistente (p. ej. `connect-sqlite3` o Redis).
- **Logo de Soprole en el footer:** actualmente es un texto estilizado de marcador.
  Reemplazar por el logo oficial cuando el cliente lo entregue (dejarlo en `/assets`).
- **Imágenes de personas/stock:** los mockups usan fotografías que no venían como
  archivos sueltos; las secciones muestran marcadores y son **subibles desde el admin**.
- **Aviso de seguridad (npm audit):** queda una advertencia *moderada* transitiva
  en `@azure/msal-node` (dependencia `uuid`). Su corrección es un cambio mayor del
  módulo de SSO; abordar al activar el SSO de Microsoft.

## 🔒 Endurecimiento aplicado y pendiente

Tras una revisión de seguridad se aplicaron estas medidas:

- **`SESSION_SECRET` obligatorio en producción** (arranque falla si falta o es corto).
- **`trust proxy` en producción** para que la cookie `secure` funcione tras un reverse-proxy
  (evita el bucle de login del admin al desplegar).
- **Cookie de sesión** `httpOnly` + `sameSite: 'lax'` + `secure` en producción.
- **Subida de archivos**: SVG bloqueado (evita XSS), la extensión en disco se deriva del
  tipo validado (no del nombre del cliente), y `/uploads` se sirve con `X-Content-Type-Options: nosniff`.
- **Login**: rate-limit en memoria (8 intentos / 15 min) y rechazo de la contraseña por
  defecto en producción.
- **Errores**: el stack solo se muestra con `DEBUG_ERRORS=true`; por defecto, mensaje genérico.
- **SSO**: el flujo OAuth incluye validación de `state` y `nonce` (anti-CSRF de login).

Pendiente recomendado al pasar a producción (no crítico para la base):

- **Tokens CSRF** por formulario en `/admin` (hoy mitigado con `sameSite`).
- **Validación por *magic bytes*** del contenido subido (además del tipo declarado).
- **Store de sesión persistente** (Redis/`connect-sqlite3`) y **rate-limit compartido**
  si se corre en múltiples instancias.
- Considerar **helmet** para cabeceras de seguridad y `NODE_ENV=production` en el deploy.
