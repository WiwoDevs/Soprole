'use strict';

/**
 * Rutas del sitio — VERSIÓN ESTÁTICA.
 * Cada página obtiene su contenido del modelo, que ahora lee de un archivo
 * JSON congelado (sin base de datos ni CMS). Todo el sitio está protegido por
 * autenticación (ver server.js / requireAuth).
 */

const express = require('express');
const router = express.Router();
const Content = require('../models/content');

// Helper: arma el contexto común de contenido para las vistas.
function baseLocals() {
  return {
    c: Content.getAll(),
    testimonials: Content.testimonials(),
  };
}

// --- Home ---
router.get('/', (req, res) => {
  res.render('pages/home', {
    title: 'conTIgo · Soprole',
    active: 'home',
    ...baseLocals(),
    cards: Content.newsCards('home'),
  });
});

// --- Proyectos ---
router.get('/proyectos', (req, res) => {
  res.render('pages/proyectos', {
    title: 'Proyectos · conTIgo Soprole',
    active: 'proyectos',
    ...baseLocals(),
    stats: Content.stats(),
    roleTabs: Content.roleTabs(),
    teamPhotos: Content.teamPhotos(),
  });
});

// --- Contacto (solo información estática; sin formulario ni almacenamiento) ---
router.get('/contacto', (req, res) => {
  res.render('pages/contacto', {
    title: 'Contacto · conTIgo Soprole',
    active: 'contacto',
    ...baseLocals(),
  });
});

module.exports = router;
