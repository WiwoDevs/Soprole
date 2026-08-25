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
      // Sin esto, el panel se oculta pero el video sigue sonando de fondo.
      // Sin devolver el foco: el panel saliente pasa a display:none.
      if (typeof cerrarVideo === 'function') cerrarVideo(false);
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


  // --- Carrusel "Nuestro Team" ------------------------------------------
  // Tres cosas a la vez:
  //  1. Carga perezosa: los 25 clips suman mas de 300 MB, asi que cada video
  //     se conecta a su archivo (data-src -> src) recien al entrar en pantalla.
  //  2. Reproduccion automatica del slide visible, y pausa al salir.
  //  3. Avance solo: al terminar el clip pasa al siguiente. Las fotos, que no
  //     "terminan", avanzan por temporizador.
  var teamCarousel = document.querySelector('.team-carousel[data-carousel]');
  if (teamCarousel && 'IntersectionObserver' in window) {
    var teamSlides = Array.prototype.slice.call(teamCarousel.querySelectorAll('.team-slide'));
    var teamTrack = teamCarousel.querySelector('[data-carousel-track]');
    var teamNext = teamCarousel.querySelector('[data-carousel-next]');
    var reduceTeam = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var FOTO_MS = 5000;     // cuanto se queda una foto antes de avanzar
    var temporizador = null;
    var manual = false;     // el usuario tomo el control: no avanzamos solos

    function limpiarTemporizador() {
      if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    }

    function avanzar() {
      if (manual || reduceTeam || !teamTrack) return;
      // Se reutiliza el boton del carrusel para no duplicar la logica de
      // desplazamiento; al llegar al final vuelve al principio.
      if (teamNext && !teamNext.disabled) teamNext.click();
      else teamTrack.scrollTo({ left: 0, behavior: 'smooth' });
    }

    function entra(slide) {
      var v = slide.querySelector('[data-team-video]');
      if (v) {
        if (!v.getAttribute('src')) {
          var src = v.getAttribute('data-src');
          if (src) v.setAttribute('src', src);
        }
        if (reduceTeam) return;
        v.currentTime = 0;
        var p = v.play();
        if (p && p.catch) p.catch(function () {
          // Si el navegador bloquea la reproduccion, no dejamos el carrusel
          // congelado: se avanza igual pasado el tiempo de una foto.
          limpiarTemporizador();
          temporizador = setTimeout(avanzar, FOTO_MS);
        });
        return;
      }
      // Slide de foto: no hay evento "termino", asi que se usa un reloj.
      limpiarTemporizador();
      temporizador = setTimeout(avanzar, FOTO_MS);
    }

    function sale(slide) {
      var v = slide.querySelector('[data-team-video]');
      if (v && !v.paused) v.pause();
      limpiarTemporizador();
    }

    var teamObserver = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) entra(e.target);
        else sale(e.target);
      });
    }, { threshold: 0.6 });

    teamSlides.forEach(function (slide) {
      teamObserver.observe(slide);
      var v = slide.querySelector('[data-team-video]');
      if (!v) return;
      // Al terminar el clip, al siguiente.
      v.addEventListener('ended', avanzar);
      // Si el usuario activa el sonido o pausa a mano, deja de avanzar solo:
      // esta viendo ese testimonio y no queremos arrebatarselo.
      v.addEventListener('volumechange', function () { if (!v.muted) manual = true; });
      v.addEventListener('pause', function () { if (!v.ended) manual = true; });
    });

    // Tocar las flechas o los puntos tambien detiene el avance automatico.
    teamCarousel.addEventListener('click', function (e) {
      if (e.target.closest('.carousel__btn, .carousel__dots')) { manual = true; limpiarTemporizador(); }
    });
  }


  // --- Reproductor de video ---------------------------------------------
  // Sustituye la portada por el reproductor y sabe VOLVER a la portada, para
  // que no quede un video sonando al cambiar de cápsula. Solo puede haber uno
  // abierto a la vez.
  var videoAbierto = null; // { box, portada, play }

  function cerrarVideo(devolverFoco) {
    if (!videoAbierto) return;
    var abierto = videoAbierto;
    videoAbierto = null;

    // Detiene explícitamente antes de vaciar: en algunos navegadores un
    // <video> suelto sigue sonando si solo se quita del DOM.
    var v = abierto.box.querySelector('video');
    if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {} }

    abierto.box.innerHTML = abierto.portada;
    abierto.box.classList.remove('is-playing');
    enlazarPlay(abierto.box);

    // Solo devolvemos el foco cuando el cierre fue una acción del usuario. Si
    // se cierra por cambio de pestaña, el panel queda display:none y enfocar
    // un elemento oculto manda el foco al <body>.
    if (devolverFoco) {
      var btn = abierto.box.querySelector('.video__play');
      if (btn) btn.focus();
    }
  }

  function abrirVideo(box) {
    var url = box.getAttribute('data-video');
    if (!url) return;

    cerrarVideo(false);

    var portada = box.innerHTML;
    var poster = box.querySelector('img');
    box.innerHTML = '';
    box.classList.add('is-playing');
    box.appendChild(construirReproductor(url, poster ? poster.getAttribute('src') : ''));

    var cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'video__close';
    cerrar.setAttribute('aria-label', 'Cerrar el video');
    cerrar.innerHTML = '&times;';
    cerrar.addEventListener('click', function () { cerrarVideo(true); });
    box.appendChild(cerrar);

    videoAbierto = { box: box, portada: portada };

    var v = box.querySelector('video');
    if (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    cerrar.focus();
  }

  function construirReproductor(url, poster) {
    var yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
    var vm = url.match(/vimeo\.com\/(\d+)/);

    if (yt || vm) {
      var frame = document.createElement('iframe');
      frame.src = yt
        ? 'https://www.youtube.com/embed/' + yt[1] + '?autoplay=1&rel=0'
        : 'https://player.vimeo.com/video/' + vm[1] + '?autoplay=1';
      frame.setAttribute('allow', 'autoplay; encrypted-media; fullscreen');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('title', 'Reproductor de video');
      return frame;
    }

    // Archivo de video directo (nuestro /media, o cualquier URL de archivo).
    var v = document.createElement('video');
    v.src = url;                    // vía propiedad: nunca concatenando HTML
    v.controls = true;
    v.setAttribute('playsinline', ''); // iOS: reproduce en línea, sin forzar pantalla completa
    v.preload = 'auto';
    if (poster) v.poster = poster;     // evita el rectángulo negro mientras carga
    return v;
  }

  function enlazarPlay(box) {
    var play = box.querySelector('.video__play');
    if (!play) return;
    // Sin URL configurada no hay alert(): el botón queda inerte y anunciado
    // como deshabilitado. El estado "próximamente" lo pinta la plantilla.
    if (!box.getAttribute('data-video')) {
      play.setAttribute('aria-disabled', 'true');
      play.classList.add('video__play--soon');
      play.title = 'Disponible próximamente';
      return;
    }
    play.addEventListener('click', function () { abrirVideo(box); });
  }

  document.querySelectorAll('.video').forEach(function (box) {
    if (box.classList.contains('video--link')) return; // enlace externo: no es reproductor
    enlazarPlay(box);
  });

  // Escape cierra el video. Ojo: no llega si el foco está dentro de un iframe
  // de terceros — por eso el botón de cerrar es el mecanismo principal.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && videoAbierto) cerrarVideo(true);
  });

  // --- Contadores dinámicos (cuentan desde 0 al entrar en pantalla) ---
  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count-to]'));
  if (counters.length) {
    var reduceCount = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function runCounter(el) {
      var target = parseInt(el.getAttribute('data-count-to'), 10);
      if (isNaN(target)) return;
      if (reduceCount) { el.textContent = String(target); return; }

      var DURATION = 1600;
      var start = null;
      function step(now) {
        if (start === null) start = now;
        var p = Math.min(1, (now - start) / DURATION);
        // easeOutCubic: arranca rápido y frena al llegar al valor final
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased));
        if (p < 1) window.requestAnimationFrame(step);
        else el.textContent = String(target);
      }
      window.requestAnimationFrame(step);
    }

    if ('IntersectionObserver' in window) {
      var counterObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          runCounter(entry.target);
          counterObserver.unobserve(entry.target); // se anima una sola vez
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { counterObserver.observe(el); });
    } else {
      counters.forEach(runCounter);
    }
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
