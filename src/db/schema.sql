-- =====================================================================
--  Esquema de la base de datos — conTIgo Soprole
--  Todo el contenido visible del sitio es editable desde /admin.
-- =====================================================================

-- Bloques de texto escalares (clave -> valor). La clave sigue el patrón
-- "<pagina>.<seccion>.<campo>" para poder agruparlos en el panel.
CREATE TABLE IF NOT EXISTS content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  page       TEXT NOT NULL DEFAULT 'global',   -- agrupador en el admin
  label      TEXT NOT NULL DEFAULT '',         -- etiqueta legible en el admin
  type       TEXT NOT NULL DEFAULT 'text',     -- text | textarea | richtext | image | url
  sort       INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tarjetas de noticias / destacados ("ConTIgo al día" y tarjetas del Home).
CREATE TABLE IF NOT EXISTS news_cards (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  page    TEXT NOT NULL DEFAULT 'contigo-al-dia', -- 'home' | 'contigo-al-dia'
  title   TEXT NOT NULL DEFAULT '',
  body    TEXT NOT NULL DEFAULT '',
  image   TEXT NOT NULL DEFAULT '',
  link    TEXT NOT NULL DEFAULT '#',
  cta     TEXT NOT NULL DEFAULT 'Leer más',
  accent  TEXT NOT NULL DEFAULT 'blue',          -- blue | red | dark (color del botón/título)
  sort    INTEGER NOT NULL DEFAULT 0,
  active  INTEGER NOT NULL DEFAULT 1
);

-- Testimonios / citas de colaboradores.
CREATE TABLE IF NOT EXISTS testimonials (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  quote  TEXT NOT NULL DEFAULT '',
  name   TEXT NOT NULL DEFAULT '',
  role   TEXT NOT NULL DEFAULT '',
  image  TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT 'green',           -- green | blue
  sort   INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Indicadores / estadísticas de la página Proyectos.
CREATE TABLE IF NOT EXISTS stats (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  value  TEXT NOT NULL DEFAULT '',
  label  TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT 'red',             -- red | blue
  sort   INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Pestañas de roles ("Rol 1..4") de la sección Capacitación en Proyectos.
CREATE TABLE IF NOT EXISTS role_tabs (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  label  TEXT NOT NULL DEFAULT '',                -- texto de la pestaña
  title  TEXT NOT NULL DEFAULT '',
  body   TEXT NOT NULL DEFAULT '',
  image  TEXT NOT NULL DEFAULT '',                -- retrato (izquierda)
  image2 TEXT NOT NULL DEFAULT '',                -- foto secundaria (derecha)
  tags   TEXT NOT NULL DEFAULT '',                -- lista separada por '|'
  sort   INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- Envíos del formulario de contacto / captación de leads.
CREATE TABLE IF NOT EXISTS submissions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  subject    TEXT NOT NULL DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ajustes internos (hash de contraseña del admin local, etc.).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
