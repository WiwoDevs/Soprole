'use strict';

/**
 * Rutas públicas del sitio. Cada página obtiene su contenido desde el modelo,
 * de modo que TODO el texto e imágenes son editables desde /admin.
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

// --- Home (Landing Contigo.jpg) ---
router.get('/', (req, res) => {
  res.render('pages/home', {
    title: 'conTIgo · Soprole',
    active: 'home',
    ...baseLocals(),
    cards: Content.newsCards('home'),
  });
});

// --- Proyectos (Landing Contigo _ Proyectos.jpg) ---
router.get('/proyectos', (req, res) => {
  res.render('pages/proyectos', {
    title: 'Proyectos · conTIgo Soprole',
    active: 'proyectos',
    ...baseLocals(),
    stats: Content.stats(),
    roleTabs: Content.roleTabs(),
  });
});

// --- Contacto (formulario) ---
router.get('/contacto', (req, res) => {
  res.render('pages/contacto', {
    title: 'Contacto · conTIgo Soprole',
    active: 'contacto',
    ...baseLocals(),
    sent: req.query.sent === '1',
    error: null,
  });
});

router.post('/contacto', (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  if (!name || !email || !message) {
    return res.status(400).render('pages/contacto', {
      title: 'Contacto · conTIgo Soprole',
      active: 'contacto',
      ...baseLocals(),
      sent: false,
      error: 'Por favor completa nombre, correo y mensaje.',
      form: req.body,
    });
  }
  Content.createSubmission({ name, email, phone, subject, message });
  res.redirect('/contacto?sent=1');
});

module.exports = router;
