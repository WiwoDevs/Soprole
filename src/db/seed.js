'use strict';

/**
 * Carga inicial de contenidos (seed).
 *
 * - Los textos reproducen EXACTAMENTE los mockups entregados.
 * - Es idempotente: las tablas de colecciones (tarjetas, testimonios, etc.)
 *   solo se llenan si están vacías, para no pisar ediciones hechas desde /admin.
 * - El contenido escalar (tabla `content`) se inserta con INSERT OR IGNORE:
 *   crea las claves que falten pero respeta los valores ya editados.
 *
 * Uso:
 *   node src/db/seed.js            -> crea schema y siembra lo que falte
 *   node src/db/seed.js --reset    -> BORRA todo el contenido y vuelve a sembrar
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { db, initSchema } = require('./index');

const RESET = process.argv.includes('--reset');

initSchema();

if (RESET) {
  console.log('⚠️  --reset: vaciando tablas de contenido...');
  for (const t of ['content', 'news_cards', 'testimonials', 'stats', 'role_tabs']) {
    db.exec(`DELETE FROM ${t};`);
  }
}

// --------------------------------------------------------------------------
// 1) Contenido escalar (clave -> valor) por página
// --------------------------------------------------------------------------
const ASSET = (file) => `/assets/${file}`;
const PUB = (file) => `/assets/public/${file}`; // imágenes de personas entregadas

// Imágenes reales entregadas por el cliente (carpeta assets/public).
const IMG = {
  heroHome: PUB('3dd5e114974685c253f3718004b3a4afbc23f121.png'), // equipo de pie SIN FONDO (recorte nítido, capa delantera)
  heroHomeBg: PUB('d6e865f8fc39b272403aaecaf75f31260f62a2e6.png'), // MISMA foto CON fondo (capa trasera difuminada)
  marcoBg: PUB('e117d6da0fb16e1b23ab4bf32d5a705e23ed1637.png'), // MISMA foto del Marco CON fondo (capa trasera difuminada)
  heroContigo: PUB('07bb58b749e26ad47782445866d8bf6e99d763b0.png'), // equipo sentado (Soprole)
  heroProyectos: PUB('35fff7383be103f486dddf43fdb06bd7c96c9bac.jpg'), // línea de envasado leche
  marco: PUB('83d2b43791d501934db0ce610f67f4674571442b.png'), // recorte sin fondo: dúo en laptop
  videoPoster: PUB('36bf97e37c52b5ab42c9b6b65ff208d8b863c688.jpg'), // hombre con celular
  capacitaPoster: PUB('219d85522de3842ea93b678538230ea749a51ec1.png'), // equipo en laptop (Soprole)
  cardTech: PUB('bcc40fa6b0931a279ddd602bf2c802306fdca033.jpg'), // gráfico tecnológico
  cardLaptop: PUB('5da4dae5c9922522fc08d29d54ab363d02df8e88.png'), // hombre+mujer en escritorio
  newsInnovacion: PUB('a55b6a2e7d7295fe3db5815f084f0c420732b989.png'), // chalecos en bodega
  newsDiversidad: PUB('0676ffde118898c77ed0083bdc9fc55123132010.png'), // grupo con chalecos
  newsAdopcion: PUB('bbd197f055c73583e7ea5961c68da92f11ecc378.png'), // capacitación en carpa
  talentoPortrait: PUB('4bc87e001c37b87ae3a555e52e80b27912946364.png'), // mujer rubia (retrato)
  talentoGroup: PUB('e117d6da0fb16e1b23ab4bf32d5a705e23ed1637.png'), // grupo en laptop
  testimonialMonica: PUB('1027a0587cd16892a534f425040d8000c03c10a2.png'), // mujer sin fondo
  testimonialJavier: PUB('f58f3b939b17e36aea2649d17aa8a98fcb7e355a.png'), // hombre sin fondo
};

const content = [
  // ---- GLOBAL (header / footer / contacto) ----
  ['global.brand.logo', ASSET('Logo Contigo.png'), 'Global', 'Logo conTIgo (header)', 'image', 1],
  ['global.nav.search_placeholder', '¿Qué estás buscando?', 'Global', 'Placeholder del buscador', 'text', 2],
  ['global.nav.cta', 'Contacto', 'Global', 'Botón de contacto (header)', 'text', 3],
  ['global.footer.title', 'Mesa de Ayuda', 'Global', 'Footer · título Mesa de Ayuda', 'text', 10],
  ['global.footer.email', 'mesadeayuda@soprole.cl', 'Global', 'Footer · email', 'text', 11],
  ['global.footer.phone', '224365100', 'Global', 'Footer · teléfono', 'text', 12],
  ['global.footer.anexo', '5100', 'Global', 'Footer · anexo', 'text', 13],
  ['global.footer.copyright', '© 2026 Soprole Contigo. Todos los derechos reservados.', 'Global', 'Footer · copyright', 'text', 14],

  // ---- HOME (Landing Contigo.jpg) ----
  ['home.hero.title', 'Si funciona, es porque estamos conTIgo.', 'Home', 'Hero · título', 'textarea', 1],
  ['home.hero.line1', 'Con todas las personas.', 'Home', 'Hero · línea 1', 'text', 2],
  ['home.hero.line2', 'Con todos los sistemas.', 'Home', 'Hero · línea 2', 'text', 3],
  ['home.hero.line3', 'Con todos los procesos.', 'Home', 'Hero · línea 3', 'text', 4],
  ['home.hero.subtitle', 'Y seguiremos estando, para colaborar juntos y potenciar a cada área en sus desafíos.', 'Home', 'Hero · subtítulo', 'textarea', 5],
  ['home.hero.image', IMG.heroHome, 'Home', 'Hero · imagen recorte (frente)', 'image', 6],
  ['home.hero.image_bg', IMG.heroHomeBg, 'Home', 'Hero · imagen fondo (se difumina detrás)', 'image', 7],
  ['home.cta.title', '¿Quieres solicitar una nueva iniciativa?', 'Home', 'CTA · título', 'text', 20],
  ['home.cta.button', 'Haz click aquí', 'Home', 'CTA · botón', 'text', 21],
  ['home.cta.link', '/contacto', 'Home', 'CTA · enlace', 'url', 22],

  // ---- CONTIGO AL DÍA (Landing Contigo _ Comentario.jpg) ----
  ['contigo.hero.title', 'Si funciona, es porque estamos conTIgo.', 'ConTIgo al día', 'Hero · título', 'textarea', 1],
  ['contigo.hero.tagline', 'Somos tu socio estratégico', 'ConTIgo al día', 'Hero · bajada', 'text', 2],
  ['contigo.hero.image', IMG.heroContigo, 'ConTIgo al día', 'Hero · imagen (equipo)', 'image', 3],
  ['contigo.news.title', 'ConTIgo al día', 'ConTIgo al día', 'Título de la sección de noticias', 'text', 10],

  // ---- PROYECTOS (Landing Contigo _ Proyectos.jpg) ----
  ['proyectos.hero.title', 'Proyectos', 'Proyectos', 'Hero · título', 'text', 1],
  ['proyectos.hero.image', IMG.heroProyectos, 'Proyectos', 'Hero · imagen de fondo', 'image', 2],
  ['proyectos.marco.title', 'Marco Metodológico', 'Proyectos', 'Marco · título', 'text', 10],
  ['proyectos.marco.body', 'Con la implementación de herramientas avanzadas, el equipo de TI está llevando la digitalización interna a nuevas alturas. Explora cómo están usando tecnologías de vanguardia para mejorar la eficiencia operativa.', 'Proyectos', 'Marco · texto', 'textarea', 11],
  ['proyectos.marco.button', 'Descarga aquí', 'Proyectos', 'Marco · botón', 'text', 12],
  ['proyectos.marco.link', '#', 'Proyectos', 'Marco · enlace de descarga', 'url', 13],
  ['proyectos.marco.image', IMG.marco, 'Proyectos', 'Marco · imagen recorte (frente)', 'image', 14],
  ['proyectos.marco.image_bg', IMG.marcoBg, 'Proyectos', 'Marco · imagen fondo (se difumina detrás)', 'image', 15],
  ['proyectos.capacitacion.title', 'Capacitación', 'Proyectos', 'Capacitación · título', 'text', 20],
  ['proyectos.capacitacion.body', 'Con una combinación única de talentos y perspectivas, el equipo de TI se distingue por su enfoque colaborativo y diverso. Conoce cómo este equipo impulsa proyectos innovadores en un entorno inclusivo.', 'Proyectos', 'Capacitación · texto', 'textarea', 21],
  ['proyectos.capacitacion.video', '', 'Proyectos', 'Capacitación · URL del video', 'url', 22],
  ['proyectos.capacitacion.poster', IMG.capacitaPoster, 'Proyectos', 'Capacitación · portada del video', 'image', 23],
  ['proyectos.talento.title', 'Impulsando el talento a través de la capacitación', 'Proyectos', 'Talento · título', 'text', 30],
  ['proyectos.talento.body', 'La capacitación es un pilar fundamental para el crecimiento de Soprole, impulsando el desarrollo continuo de sus equipos y fortaleciendo sus capacidades frente a los desafíos del entorno digital. A través de programas formativos, talleres especializados y aprendizaje colaborativo, la compañía promueve una cultura donde el conocimiento se comparte y evoluciona constantemente.', 'Proyectos', 'Talento · texto', 'textarea', 31],
  ['proyectos.futuro.title', 'Proyectos TI que impulsan el futuro', 'Proyectos', 'Futuro · título', 'text', 40],
  ['proyectos.futuro.body', 'El equipo de TI desarrolla iniciativas clave para optimizar procesos, integrar sistemas y avanzar en la transformación digital. Cada proyecto busca mejorar la eficiencia, fortalecer la operación y aportar valor al negocio.', 'Proyectos', 'Futuro · texto', 'textarea', 41],

  // ---- VIDEO (sección compartida Home / ConTIgo al día) ----
  ['video.url', '', 'Global', 'Video destacado · URL (YouTube/Vimeo/mp4)', 'url', 30],
  ['video.poster', IMG.videoPoster, 'Global', 'Video destacado · imagen de portada', 'image', 31],

  // ---- CONTACTO ----
  ['contacto.title', 'Contacto', 'Contacto', 'Título de la página', 'text', 1],
  ['contacto.subtitle', 'Cuéntanos en qué podemos ayudarte y te responderemos a la brevedad.', 'Contacto', 'Subtítulo', 'textarea', 2],
];

const upsertContent = db.prepare(
  `INSERT INTO content (key, value, page, label, type, sort)
   VALUES (@key, @value, @page, @label, @type, @sort)
   ON CONFLICT(key) DO UPDATE SET
     page = excluded.page, label = excluded.label, type = excluded.type, sort = excluded.sort`
);
// Nota: ON CONFLICT no toca `value`, así se respeta lo editado desde /admin.

const seedContent = db.transaction((rows) => {
  for (const [key, value, page, label, type, sort] of rows) {
    upsertContent.run({ key, value, page, label, type, sort });
  }
});
seedContent(content);

// --------------------------------------------------------------------------
// 2) Colecciones (solo si están vacías)
// --------------------------------------------------------------------------
function seedIfEmpty(table, rows, insertSql) {
  const count = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  if (count > 0) {
    console.log(`• ${table}: ya tiene datos (${count}), se omite.`);
    return;
  }
  const stmt = db.prepare(insertSql);
  const tx = db.transaction((items) => items.forEach((r) => stmt.run(r)));
  tx(rows);
  console.log(`✓ ${table}: ${rows.length} registros sembrados.`);
}

// Tarjetas del HOME
seedIfEmpty(
  'news_cards',
  [
    {
      page: 'home', accent: 'dark', sort: 1, link: '#', cta: 'Leer más', image: IMG.cardTech,
      title: 'Nuestros proyectos tecnológicos',
      body: 'Desarrollamos soluciones que integran personas, sistemas y procesos para que la operación funcione de manera eficiente y conectada.',
    },
    {
      page: 'home', accent: 'dark', sort: 2, link: '#', cta: 'Leer más', image: IMG.cardLaptop,
      title: 'Una nueva forma de trabajar',
      body: 'Desarrollamos soluciones que integran personas, sistemas y procesos para que la operación funcione de manera eficiente y conectada.',
    },
    // Tarjetas "ConTIgo al día"
    {
      page: 'contigo-al-dia', accent: 'blue', sort: 1, link: '#', cta: 'Leer más', image: IMG.newsInnovacion,
      title: 'Innovación Tecnológica en el Equipo de TI',
      body: 'El área de TI está implementando nuevas soluciones digitales para optimizar la operación y la experiencia de usuario. Descubre cómo el equipo está trabajando para llevar la empresa al siguiente nivel.',
    },
    {
      page: 'contigo-al-dia', accent: 'red', sort: 2, link: '#', cta: 'Leer más', image: IMG.newsDiversidad,
      title: 'Diversidad y Colaboración en TI',
      body: 'Con una combinación única de talentos y perspectivas, el equipo de TI se distingue por su enfoque colaborativo y diverso. Conoce cómo este equipo impulsa proyectos innovadores en un entorno inclusivo.',
    },
    {
      page: 'contigo-al-dia', accent: 'blue', sort: 3, link: '#', cta: 'Leer más', image: IMG.newsAdopcion,
      title: 'Adopción de Nuevas Tecnologías',
      body: 'Con la implementación de herramientas avanzadas, el equipo de TI está llevando la digitalización interna a nuevas alturas. Explora cómo están usando tecnologías de vanguardia para mejorar la eficiencia operativa.',
    },
  ],
  `INSERT INTO news_cards (page, title, body, image, link, cta, accent, sort)
   VALUES (@page, @title, @body, @image, @link, @cta, @accent, @sort)`
);

// Testimonios (compartidos en Home y ConTIgo al día)
seedIfEmpty(
  'testimonials',
  [
    { quote: 'Cuando trabajamos en equipo, hace que todo funcione', name: 'Mónica Nuñez', role: 'Especialista en TI', image: IMG.testimonialMonica, accent: 'green', sort: 1 },
    { quote: 'Cuando trabajamos en equipo, hace que todo funcione', name: 'Javier Olarra', role: 'Especialista en TI', image: IMG.testimonialJavier, accent: 'blue', sort: 2 },
  ],
  `INSERT INTO testimonials (quote, name, role, image, accent, sort)
   VALUES (@quote, @name, @role, @image, @accent, @sort)`
);

// Estadísticas (Proyectos)
seedIfEmpty(
  'stats',
  [
    { value: '+35%', label: 'de mejora en tiempos de respuesta', accent: 'red', sort: 1 },
    { value: '98%', label: 'de disponibilidad de sistemas', accent: 'blue', sort: 2 },
    { value: '+50%', label: 'de procesos automatizados', accent: 'blue', sort: 3 },
  ],
  `INSERT INTO stats (value, label, accent, sort) VALUES (@value, @label, @accent, @sort)`
);

// Pestañas de roles (Proyectos · Capacitación)
const talentoBody =
  'La capacitación es un pilar fundamental para el crecimiento de Soprole, impulsando el desarrollo continuo de sus equipos y fortaleciendo sus capacidades frente a los desafíos del entorno digital. A través de programas formativos, talleres especializados y aprendizaje colaborativo, la compañía promueve una cultura donde el conocimiento se comparte y evoluciona constantemente.';
seedIfEmpty(
  'role_tabs',
  [
    { label: 'Rol 1', title: 'Impulsando el talento a través de la capacitación', body: talentoBody, image: IMG.talentoPortrait, image2: IMG.talentoGroup, tags: 'Innovación|Liderazgo|Excelencia', sort: 1 },
    { label: 'Rol 2', title: 'Impulsando el talento a través de la capacitación', body: talentoBody, image: IMG.talentoPortrait, image2: IMG.talentoGroup, tags: 'Innovación|Liderazgo|Excelencia', sort: 2 },
    { label: 'Rol 3', title: 'Impulsando el talento a través de la capacitación', body: talentoBody, image: IMG.talentoPortrait, image2: IMG.talentoGroup, tags: 'Innovación|Liderazgo|Excelencia', sort: 3 },
    { label: 'Rol 4', title: 'Impulsando el talento a través de la capacitación', body: talentoBody, image: IMG.talentoPortrait, image2: IMG.talentoGroup, tags: 'Innovación|Liderazgo|Excelencia', sort: 4 },
  ],
  `INSERT INTO role_tabs (label, title, body, image, image2, tags, sort)
   VALUES (@label, @title, @body, @image, @image2, @tags, @sort)`
);

// --------------------------------------------------------------------------
// 3) Contraseña del administrador local (desde .env)
// --------------------------------------------------------------------------
const DEFAULT_ADMIN_PASSWORD = 'Cambiar.123';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@soprole.cl';
const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

// En producción NO se permite la contraseña por defecto: hay que definir una propia.
if (process.env.NODE_ENV === 'production' && adminPassword === DEFAULT_ADMIN_PASSWORD) {
  console.error(
    '\n✖ Define ADMIN_PASSWORD en .env (no se permite la contraseña por defecto en producción).\n'
  );
  process.exit(1);
}

const hash = bcrypt.hashSync(adminPassword, 10);

const upsertSetting = db.prepare(
  `INSERT INTO settings (key, value) VALUES (@key, @value)
   ON CONFLICT(key) DO UPDATE SET value = excluded.value`
);
upsertSetting.run({ key: 'admin_email', value: adminEmail });
upsertSetting.run({ key: 'admin_password_hash', value: hash });

console.log(`✓ Admin local: ${adminEmail}`);
console.log('✓ Seed completado.');

if (require.main === module) {
  db.close();
}
