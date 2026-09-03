# Despliegue a producción — conTIgo Soprole (rama `estatico`)

Objetivo: **VM propia (Linux/Nginx o Windows/IIS)**, servidor **Node** (`npm start`),
con los videos en **`media/` en el disco del servidor**, subidos una sola vez fuera
del despliegue.

> **Por qué Node y no el build estático.** `npm run build` genera un `dist/` sin
> Node… y **sin login**. Esta rama existe para que todo el sitio esté tras SSO, así
> que `dist/` no sirve aquí. De hecho el build **aborta hoy a propósito**: los 27
> videos son rutas locales y publicarlos sin sesión equivale a exponerlos
> (ver `assertSinMediosLocales` en [build-static.js](build-static.js)).

---

## 1. Requisitos del servidor

| | Requisito | Por qué |
|---|---|---|
| Node | **24 LTS** (o 22 con `--experimental-sqlite`) | El store de sesiones usa `node:sqlite`. En Node ≤ 20 ese módulo no existe: el servidor **arranca igual**, pero cae a sesiones en memoria y las pierde en cada reinicio. |
| Proceso | **Una sola instancia**, sin modo cluster | El store de sesiones es SQLite local. Con varios procesos las sesiones fallan de forma intermitente ("a veces tengo que entrar dos veces"). Ver el comentario en [src/session-store.js](src/session-store.js). |
| TLS | HTTPS terminado en el reverse proxy | Con `NODE_ENV=production` la cookie sale marcada `secure`: sin HTTPS **no hay login posible**. |
| Disco | `data/` y `media/` escribibles y **persistentes** | `data/sessions.db` guarda las sesiones; `media/` los videos (724 MB). |

Comprobar la versión antes de nada:

```bash
node --version     # debe decir v24.x
```

---

## 2. Código

`assets/` (imágenes, logos, el PDF del Marco Metodológico) **sí** está en git y viaja
con el despliegue. `media/`, `.env` y `data/` **no**.

```bash
git clone -b estatico <URL-del-repo> /var/www/soprole
cd /var/www/soprole
npm ci --omit=dev
```

No hay paso de build ni de seed: las vistas EJS se renderizan en cada petición y el
contenido vive en [src/content/content.json](src/content/content.json).

---

## 3. Variables de entorno (`.env`)

```bash
cp .env.example .env
```

Cuatro valores que **hay que cambiar sí o sí**; si no, el servidor no arranca o deja
el login inutilizable:

```env
NODE_ENV=production
PORT=3000

# >= 32 caracteres y aleatorio. El servidor LANZA una excepción al arrancar si
# falta, si es corto, o si sigue siendo el placeholder del .env.example.
SESSION_SECRET=<pegar la salida de: openssl rand -base64 48>

# En producción la contraseña por defecto (Cambiar.123) queda RECHAZADA y el
# login local se desactiva por completo. Define una propia o activa el SSO.
ADMIN_EMAIL=admin@soprole.cl
ADMIN_PASSWORD=<contraseña propia>
```

Cuando Soprole entregue el registro de la app en Azure, además:

```env
AUTH_MICROSOFT_ENABLED=true
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_REDIRECT_URI=https://contigo.soprole.cl/auth/redirect
AUTH_ALLOWED_DOMAINS=soprole.cl
```

`AZURE_REDIRECT_URI` debe coincidir **exacto** con el registrado en Azure (mismo
esquema, mismo host, mismo puerto, sin barra final) o Microsoft responde `AADSTS50011`.
`AUTH_ALLOWED_DOMAINS` vacío **deniega todo** a propósito: el servidor se niega a
arrancar con el SSO activo y esa lista vacía.

---

## 4. Los videos (`media/`) — el punto delicado

Son **27 archivos, 724 MB**, y **no están en git**: [.gitignore](.gitignore) ignora
`media/`. El mayor (`soprole-contigo-master.mp4`) pesa **391 MB** — GitHub avisa sobre
50 MB y **rechaza** cualquier archivo sobre 100 MB. Por eso viajan aparte.

### Subida (una sola vez)

Desde tu equipo, con `media/` completa en local:

```bash
# Linux/Nginx — rsync reanuda si se corta y no re-sube lo que ya está
rsync -avz --progress media/ usuario@servidor:/var/www/soprole/media/

# Windows/IIS — o WinSCP / SFTP contra la misma ruta
scp -r media/* usuario@servidor:C:/inetpub/contigo/media/
```

Con 724 MB, `rsync` es preferible a `scp`: si se corta la conexión, retoma donde iba.

### Verificar ANTES de dar el sitio por publicado

Un `<video>` que no carga **no rompe la página**: se queda en negro. Por eso el fallo
se descubre tarde. En el servidor:

```bash
npm run check:media
```

Compara lo que `content.json` referencia contra lo que hay en disco y termina con
código 1 si falta algo, indicando en qué slide o clave se usa cada archivo ausente.
Detecta también los de **0 bytes** (subida cortada: existen pero no reproducen) y
lista los que sobran.

### Qué NO hacer

- **No** dejes los videos en `assets/`: esa carpeta **sí** está en git. Van en `media/`.
- **No** los metas en git "solo esta vez": el peso queda en el historial para siempre,
  aunque después los borres, y el push de 391 MB será rechazado.
- **No** despliegues con `rsync --delete` ni `git clean -xdf` sobre la raíz: te llevas
  los videos por delante. Si automatizas el deploy, `media/` y `data/` van en las
  exclusiones.

### Añadir videos nuevos más adelante

1. Copiar el archivo a `media/`.
2. Declararlo en [src/content/content.json](src/content/content.json) con ruta
   `/media/<archivo>.mp4` (clave `video` del slide o de la sección).
3. Si el nombre lleva espacios, la ruta va URL-encoded — como el ya existente
   `/media/Video%20Soprole.mp4`. `npm run check:media` decodifica y valida ambas formas.
4. `npm run check:media` y reiniciar.

---

## 5. Reverse proxy

El servidor Node escucha en `PORT` y **no** termina TLS. Debe recibir
`X-Forwarded-Proto`, o Express no emitirá la cookie `secure` y el login entrará en
bucle (`app.set('trust proxy', 1)` ya está puesto para producción).

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name contigo.soprole.cl;

    ssl_certificate     /etc/ssl/contigo.crt;
    ssl_certificate_key /etc/ssl/contigo.key;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;   # imprescindible
    }

    # Video: sin buffering, o Nginx intenta guardar el mp4 entero en un temporal
    # antes de empezar a enviarlo — con 391 MB eso es una espera larga o un fallo.
    location /media/ {
        proxy_pass                http://127.0.0.1:3000;
        proxy_http_version        1.1;
        proxy_set_header          Host              $host;
        proxy_set_header          X-Forwarded-Proto $scheme;
        proxy_set_header          Range             $http_range;
        proxy_set_header          If-Range          $http_if_range;
        proxy_buffering           off;
        proxy_max_temp_file_size  0;
        proxy_read_timeout        600s;
    }
}

server {                      # redirección a HTTPS
    listen 80;
    server_name contigo.soprole.cl;
    return 301 https://$host$request_uri;
}
```

`express.static` ya responde peticiones por rango (`Range`) de fábrica — es lo que
permite adelantar el video y lo que Safari en iOS **exige** para reproducir. El proxy
solo tiene que no estorbar.

### IIS

Con **iisnode**, en el `web.config`:

```xml
<iisnode nodeProcessCountPerApplication="1" />
```

**Obligatorio.** Por defecto iisnode levanta un worker por CPU, y con el store de
sesiones en SQLite local eso rompe el login de forma intermitente.

Alternativa más limpia en Windows: correr Node como servicio (NSSM o `node-windows`)
y usar IIS solo como reverse proxy con ARR, con la misma configuración conceptual que
Nginx.

---

## 6. Mantener el proceso vivo

### systemd (Linux)

```ini
# /etc/systemd/system/contigo.service
[Unit]
Description=conTIgo Soprole
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/soprole
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now contigo
sudo journalctl -u contigo -f
```

---

## 7. Verificación post-despliegue

```bash
npm run check:media                                                                   # los 27 presentes
curl -o /dev/null -w '%{http_code}\n' https://contigo.soprole.cl/                     # 302 -> /login
curl -o /dev/null -w '%{http_code}\n' https://contigo.soprole.cl/login                # 200
curl -o /dev/null -w '%{http_code}\n' https://contigo.soprole.cl/media/soprole-contigo-master.mp4   # 403
```

Que `/media/...` responda **403 sin sesión es lo correcto**: los videos están tras
login, y el guardia devuelve 403 en vez de redirigir para que `<video>` falle limpio
cuando la sesión expira.

En el arranque el servidor imprime su estado. Revisar estas líneas:

```
  ► Entorno: production   ·   cookie secure: true
  ► Sesiones: SQLite (persistente)      <-- si dice "en memoria", el Node es viejo
  ► Login local: disponible
  ► SSO Microsoft: ...
```

Y en el navegador, con sesión iniciada: que un video reproduzca **y que se pueda
adelantar** — eso confirma que el `Range` llega íntegro a través del proxy.

---

## 8. Actualizaciones posteriores

```bash
cd /var/www/soprole
git pull
npm ci --omit=dev
sudo systemctl restart contigo
```

`media/`, `data/` y `.env` no se tocan: no están en git. Tras cambiar CSS o JS no hace
falta purgar cache — [src/asset-version.js](src/asset-version.js) versiona las URLs por
el hash del contenido.

---

## Pendientes conocidos

- **Sesiones**: SQLite resuelve **una** instancia. Si algún día se escala a varias,
  hay que pasar a Redis (`connect-redis`) — anotado en `src/session-store.js`.
- **Rate-limit del login**: en memoria (8 intentos / 15 min). Con una sola instancia
  funciona; con varias deja de ser efectivo.
- **Cabeceras de seguridad**: falta `helmet`.
