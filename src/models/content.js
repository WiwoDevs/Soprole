'use strict';

/**
 * Modelo de contenido: única puerta de entrada a la base de datos para el
 * resto de la app. Las rutas y vistas nunca hablan SQL directamente.
 */

const { db } = require('../db');

// --------------------------------------------------------------------------
// Contenido escalar (clave -> valor)
// --------------------------------------------------------------------------
const getOneStmt = db.prepare('SELECT value FROM content WHERE key = ?');

/** Devuelve el valor de una clave, o `fallback` si no existe. */
function get(key, fallback = '') {
  const row = getOneStmt.get(key);
  return row ? row.value : fallback;
}

/**
 * Devuelve un objeto { clave: valor } con TODAS las claves de contenido,
 * para inyectarlo en las vistas como `c`.
 */
function getAll() {
  const rows = db.prepare('SELECT key, value FROM content').all();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

/** Devuelve las filas de contenido agrupadas por página (para el admin). */
function getGroupedForAdmin() {
  const rows = db
    .prepare('SELECT key, value, page, label, type, sort FROM content ORDER BY page, sort, key')
    .all();
  const groups = {};
  for (const r of rows) {
    (groups[r.page] ||= []).push(r);
  }
  return groups;
}

const setStmt = db.prepare(
  "UPDATE content SET value = ?, updated_at = datetime('now') WHERE key = ?"
);
function set(key, value) {
  setStmt.run(value ?? '', key);
}

// --------------------------------------------------------------------------
// Colecciones
// --------------------------------------------------------------------------
function newsCards(page) {
  return db
    .prepare('SELECT * FROM news_cards WHERE page = ? AND active = 1 ORDER BY sort, id')
    .all(page);
}

function testimonials() {
  return db.prepare('SELECT * FROM testimonials WHERE active = 1 ORDER BY sort, id').all();
}

function stats() {
  return db.prepare('SELECT * FROM stats WHERE active = 1 ORDER BY sort, id').all();
}

function roleTabs() {
  return db.prepare('SELECT * FROM role_tabs WHERE active = 1 ORDER BY sort, id').all();
}

// --------------------------------------------------------------------------
// CRUD genérico para colecciones (usado por el admin)
// --------------------------------------------------------------------------
const COLLECTIONS = {
  news_cards: ['page', 'title', 'body', 'image', 'link', 'cta', 'accent', 'sort', 'active'],
  testimonials: ['quote', 'name', 'role', 'image', 'accent', 'sort', 'active'],
  stats: ['value', 'label', 'accent', 'sort', 'active'],
  role_tabs: ['label', 'title', 'body', 'image', 'image2', 'tags', 'sort', 'active'],
};

function listAll(table) {
  if (!COLLECTIONS[table]) throw new Error(`Colección desconocida: ${table}`);
  return db.prepare(`SELECT * FROM ${table} ORDER BY sort, id`).all();
}

function getRow(table, id) {
  if (!COLLECTIONS[table]) throw new Error(`Colección desconocida: ${table}`);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
}

function createRow(table, data) {
  const cols = COLLECTIONS[table];
  if (!cols) throw new Error(`Colección desconocida: ${table}`);
  const fields = cols.filter((c) => data[c] !== undefined);
  const placeholders = fields.map((f) => `@${f}`).join(', ');
  const stmt = db.prepare(
    `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`
  );
  return stmt.run(pick(data, fields));
}

function updateRow(table, id, data) {
  const cols = COLLECTIONS[table];
  if (!cols) throw new Error(`Colección desconocida: ${table}`);
  const fields = cols.filter((c) => data[c] !== undefined);
  if (fields.length === 0) return;
  const setClause = fields.map((f) => `${f} = @${f}`).join(', ');
  const stmt = db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = @id`);
  return stmt.run({ ...pick(data, fields), id });
}

function deleteRow(table, id) {
  if (!COLLECTIONS[table]) throw new Error(`Colección desconocida: ${table}`);
  return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) out[k] = obj[k];
  return out;
}

// --------------------------------------------------------------------------
// Formulario de contacto
// --------------------------------------------------------------------------
function createSubmission({ name, email, phone, subject, message }) {
  return db
    .prepare(
      `INSERT INTO submissions (name, email, phone, subject, message)
       VALUES (@name, @email, @phone, @subject, @message)`
    )
    .run({
      name: name || '',
      email: email || '',
      phone: phone || '',
      subject: subject || '',
      message: message || '',
    });
}

function listSubmissions() {
  return db.prepare('SELECT * FROM submissions ORDER BY created_at DESC, id DESC').all();
}

// --------------------------------------------------------------------------
// Settings (admin local)
// --------------------------------------------------------------------------
function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

module.exports = {
  get,
  getAll,
  getGroupedForAdmin,
  set,
  newsCards,
  testimonials,
  stats,
  roleTabs,
  listAll,
  getRow,
  createRow,
  updateRow,
  deleteRow,
  createSubmission,
  listSubmissions,
  getSetting,
  COLLECTIONS,
};
