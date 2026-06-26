'use strict';

/**
 * Conexión única a la base de datos SQLite (better-sqlite3).
 *
 * SQLite se eligió por ser cero-configuración y embebida: ideal para la base
 * del proyecto. El acceso está aislado en este módulo y en src/models/*, de modo
 * que migrar más adelante a PostgreSQL/MySQL (si Soprole lo requiere) solo
 * implica cambiar esta capa, sin tocar rutas ni vistas.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'contigo.db');

// Asegura la carpeta de datos.
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Crea las tablas si no existen. Idempotente: seguro de llamar en cada arranque.
 */
function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

module.exports = { db, initSchema, DB_PATH };
