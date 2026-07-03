/* conTIgo Soprole — interacciones de front-end (sin dependencias). */
(function () {
  'use strict';

  // --- Menú móvil ---
  var burger = document.querySelector('.nav__burger');
  var nav = document.querySelector('.nav');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      nav.classList.toggle('is-open');
    });
  }

  // --- Máquina de escribir del hero (escribe · mantiene 3s · borra · cambia) ---
  document.querySelectorAll('.hero__typed').forEach(function (el) {
    var lines;
    try { lines = JSON.parse(el.getAttribute('data-typed') || '[]'); } catch (e) { lines = []; }
    lines = (lines || []).filter(function (s) { return typeof s === 'string' && s.length; });
    var textEl = el.querySelector('.hero__typed-text');
    if (!textEl || lines.length === 0) return;

    var TYPE_MS = 55;   // velocidad al escribir
    var ERASE_MS = 30;  // velocidad al borrar
    var HOLD_MS = 3000; // texto estático 3 segundos
    var GAP_MS = 350;   // pausa antes de la siguiente frase

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || lines.length === 1) {
      textEl.textContent = lines[0];
      if (lines.length > 1) {
        var idx = 0;
        setInterval(function () {
          idx = (idx + 1) % lines.length;
          textEl.textContent = lines[idx];
        }, HOLD_MS + 800);
      }
      return;
    }

    var li = 0, ci = lines[0].length, deleting = false; // arranca con la 1ª ya escrita
    function tick() {
      var full = lines[li];
      if (!deleting) {
        ci++;
        textEl.textContent = full.slice(0, ci);
        if (ci >= full.length) { deleting = true; return setTimeout(tick, HOLD_MS); }
        return setTimeout(tick, TYPE_MS);
      }
      ci--;
      textEl.textContent = full.slice(0, Math.max(0, ci));
      if (ci <= 0) {
        deleting = false;
        li = (li + 1) % lines.length;
        return setTimeout(tick, GAP_MS);
      }
      return setTimeout(tick, ERASE_MS);
    }
    // La 1ª frase ya está impresa por el servidor: espera 3s y empieza a borrar.
    setTimeout(function () { deleting = true; tick(); }, HOLD_MS);
  });

  // --- Pestañas / Cápsulas (con flechas opcionales de carrusel) ---
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var buttons = Array.prototype.slice.call(group.querySelectorAll('.tab-btn'));
    var panels = Array.prototype.slice.call(group.querySelectorAll('.tab-panel'));
    if (!buttons.length) return;
    var current = 0;

    function activate(index) {
      if (index < 0) index = buttons.length - 1;
      if (index >= buttons.length) index = 0;
      current = index;
      buttons.forEach(function (b) { b.classList.remove('is-active'); });
      panels.forEach(function (p) { p.classList.remove('is-active'); });
      buttons[index].classList.add('is-active');
      var target = buttons[index].getAttribute('data-tab');
      var panel = group.querySelector('.tab-panel[data-tab="' + target + '"]');
      if (panel) panel.classList.add('is-active');
    }

    buttons.forEach(function (btn, i) {
      btn.addEventListener('click', function () { activate(i); });
    });

    var prev = group.querySelector('[data-tab-prev]');
    var next = group.querySelector('[data-tab-next]');
    if (prev) prev.addEventListener('click', function () { activate(current - 1); });
    if (next) next.addEventListener('click', function () { activate(current + 1); });
  });

  // --- Carrusel de tarjetas (ConTIgo al día) ---
  document.querySelectorAll('[data-carousel]').forEach(function (carousel) {
    var track = carousel.querySelector('[data-carousel-track]');
    if (!track) return;
    var cards = Array.prototype.slice.call(track.children);
    if (!cards.length) return;
    var prev = carousel.querySelector('[data-carousel-prev]');
    var next = carousel.querySelector('[data-carousel-next]');
    var dotsWrap = carousel.querySelector('[data-carousel-dots]');

    function pageWidth() { return track.clientWidth; }
    function perView() {
      var cw = cards[0].getBoundingClientRect().width;
      var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
      if (!cw) return 1;
      return Math.max(1, Math.round((track.clientWidth + gap) / (cw + gap)));
    }
    function pageCount() { return Math.max(1, Math.ceil(cards.length / perView())); }

    function buildDots() {
      if (!dotsWrap) return;
      dotsWrap.innerHTML = '';
      var pages = pageCount();
      for (var i = 0; i < pages; i++) {
        (function (idx) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', 'Ir al grupo ' + (idx + 1));
          b.addEventListener('click', function () {
            track.scrollTo({ left: idx * pageWidth(), behavior: 'smooth' });
          });
          dotsWrap.appendChild(b);
        })(i);
      }
    }

    function sync() {
      var page = Math.round(track.scrollLeft / pageWidth());
      if (dotsWrap) {
        Array.prototype.forEach.call(dotsWrap.children, function (d, i) {
          d.classList.toggle('is-active', i === page);
        });
      }
      var maxScroll = track.scrollWidth - track.clientWidth;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= maxScroll - 2;
    }

    if (prev) prev.addEventListener('click', function () {
      track.scrollBy({ left: -pageWidth(), behavior: 'smooth' });
    });
    if (next) next.addEventListener('click', function () {
      track.scrollBy({ left: pageWidth(), behavior: 'smooth' });
    });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(sync); });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { buildDots(); sync(); }, 150);
    });

    buildDots();
    sync();
  });

  // --- Reproductor de video (reemplaza la portada por el embed/video) ---
  document.querySelectorAll('.video').forEach(function (box) {
    var play = box.querySelector('.video__play');
    if (!play) return;
    play.addEventListener('click', function () {
      var url = box.getAttribute('data-video');
      if (!url) {
        alert('Aún no se ha configurado el video.');
        return;
      }
      var embed = toEmbed(url);
      box.innerHTML = embed;
    });
  });

  function toEmbed(url) {
    // YouTube
    var yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
    if (yt) {
      return '<iframe src="https://www.youtube.com/embed/' + yt[1] + '?autoplay=1" allow="autoplay; encrypted-media; fullscreen" allowfullscreen></iframe>';
    }
    // Vimeo
    var vm = url.match(/vimeo\.com\/(\d+)/);
    if (vm) {
      return '<iframe src="https://player.vimeo.com/video/' + vm[1] + '?autoplay=1" allow="autoplay; fullscreen" allowfullscreen></iframe>';
    }
    // Archivo de video directo
    return '<video src="' + url + '" controls autoplay></video>';
  }

  // --- Modal de notas ("Leer más") ---
  var noteModal = document.getElementById('note-modal');
  if (noteModal) {
    var modalContent = noteModal.querySelector('.modal__content');

    function openNote(id) {
      var tpl = document.getElementById(id);
      if (!tpl || !modalContent) return;
      modalContent.innerHTML = '';
      modalContent.appendChild(tpl.content.cloneNode(true));
      noteModal.hidden = false;
      document.body.classList.add('modal-open');
      noteModal.querySelector('.modal__dialog').scrollTop = 0;
      var closeBtn = noteModal.querySelector('.modal__close');
      if (closeBtn) closeBtn.focus();
    }

    function closeNote() {
      noteModal.hidden = true;
      document.body.classList.remove('modal-open');
      if (modalContent) modalContent.innerHTML = '';
    }

    document.querySelectorAll('[data-note-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openNote(btn.getAttribute('data-note-open'));
      });
    });

    noteModal.querySelectorAll('[data-note-close]').forEach(function (el) {
      el.addEventListener('click', closeNote);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !noteModal.hidden) closeNote();
    });
  }
})();
