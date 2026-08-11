'use strict';

/**
 * Store de sesiones sobre el SQLite que Node trae incorporado (node:sqlite).
 * ---------------------------------------------------------------------------
 * Reemplaza al MemoryStore por defecto de express-session, que:
 *   - pierde memoria (nunca libera las sesiones expiradas),
 *   - borra TODAS las sesiones en cada reinicio o despliegue,
 *   - y no sirve si el sitio corre con más de un proceso.
 *
 * Se eligió node:sqlite en vez de connect-sqlite3 o session-file-store para no
 * añadir dependencias (ni compilación nativa) a un proyecto que a propósito
 * tiene muy pocas.
 *
 * LÍMITE IMPORTANTE: esto resuelve UNA instancia. Si el hosting escala a
 * varias o corre en modo cluster, las sesiones se romperán de forma
 * intermitente y habrá que pasar a Redis (connect-redis).
 */

const path = require('path');
const fs = require('fs');

module.exports = function crearStore(session) {
  const { Store } = session;

  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    return null; // Node sin node:sqlite: quien llama decide el respaldo.
  }

  // TODA la apertura va dentro del try: si el archivo está dañado (una copia en
  // conflicto de OneDrive, una escritura parcial) o retenido por otro proceso,
  // se devuelve null y el servidor cae al store en memoria con un aviso, en vez
  // de morir antes de escuchar.
  let db, qGet, qSet, qDel, qPurgar;
  try {
    const dir = process.env.SESSION_DB_DIR || path.join(__dirname, '..', 'data');
    fs.mkdirSync(dir, { recursive: true });
    db = new DatabaseSync(path.join(dir, 'sessions.db'));

    // WAL permite un escritor y varios lectores a la vez; busy_timeout hace que
    // una escritura concurrente REINTENTE en vez de lanzar al instante.
    // Sin esto, `node --watch` (que solapa el proceso viejo y el nuevo) o un
    // segundo arranque producían "database is locked": la sesión no se
    // guardaba y el síntoma era "a veces tengo que entrar dos veces".
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;
      PRAGMA secure_delete = ON;

      CREATE TABLE IF NOT EXISTS sessions (
        sid     TEXT PRIMARY KEY,
        datos   TEXT NOT NULL,
        expira  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expira ON sessions(expira);
    `);

    qGet = db.prepare('SELECT datos, expira FROM sessions WHERE sid = ?');
    qSet = db.prepare(
      'INSERT INTO sessions (sid, datos, expira) VALUES (?, ?, ?) ' +
        'ON CONFLICT(sid) DO UPDATE SET datos = excluded.datos, expira = excluded.expira'
    );
    qDel = db.prepare('DELETE FROM sessions WHERE sid = ?');
    qPurgar = db.prepare('DELETE FROM sessions WHERE expira <= ?');
  } catch (err) {
    console.warn('  ⚠ No se pudo abrir data/sessions.db:', err.message);
    return null;
  }

  // El identificador de sesión se guarda HASHEADO. Quien pueda leer el archivo
  // (un respaldo, la sincronización de OneDrive) no obtiene sid utilizables.
  const clave = (sid) => require('crypto').createHash('sha256').update(sid).digest('hex');

  // Vencimiento por defecto si la cookie no define uno (8 h, igual que server.js).
  const TTL_POR_DEFECTO_MS = 8 * 60 * 60 * 1000;

  function vencimiento(sess) {
    const ms =
      sess && sess.cookie && sess.cookie.maxAge != null
        ? sess.cookie.maxAge
        : TTL_POR_DEFECTO_MS;
    return Date.now() + ms;
  }

  class SqliteStore extends Store {
    get(sid, cb) {
      try {
        const k = clave(sid);
        const fila = qGet.get(k);
        if (!fila) return cb(null, null);
        if (fila.expira <= Date.now()) {
          qDel.run(k);
          return cb(null, null);
        }
        cb(null, JSON.parse(fila.datos));
      } catch (err) {
        cb(err);
      }
    }

    set(sid, sess, cb) {
      try {
        qSet.run(clave(sid), JSON.stringify(sess), vencimiento(sess));
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    destroy(sid, cb) {
      try {
        qDel.run(clave(sid));
        cb(null);
      } catch (err) {
        cb(err);
      }
    }

    /** Renueva el vencimiento sin reescribir los datos (rolling sessions). */
    touch(sid, sess, cb) {
      try {
        const k = clave(sid);
        const fila = qGet.get(k);
        if (fila) qSet.run(k, fila.datos, vencimiento(sess));
        cb(null);
      } catch (err) {
        cb(err);
      }
    }
  }

  const store = new SqliteStore();

  // Barrido periódico de sesiones vencidas. unref() para no impedir que el
  // proceso termine cuando corresponda.
  const limpieza = setInterval(() => {
    try {
      qPurgar.run(Date.now());
    } catch { /* la próxima pasada lo intentará de nuevo */ }
  }, 15 * 60 * 1000);
  limpieza.unref();

  return store;
};
