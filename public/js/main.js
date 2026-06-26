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

  // --- Pestañas de roles (Proyectos · Capacitación) ---
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var buttons = group.querySelectorAll('.tab-btn');
    var panels = group.querySelectorAll('.tab-panel');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.getAttribute('data-tab');
        buttons.forEach(function (b) { b.classList.remove('is-active'); });
        panels.forEach(function (p) { p.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var panel = group.querySelector('.tab-panel[data-tab="' + target + '"]');
        if (panel) panel.classList.add('is-active');
      });
    });
  });

  // --- Reproductor de video (reemplaza la portada por el embed/video) ---
  document.querySelectorAll('.video').forEach(function (box) {
    var play = box.querySelector('.video__play');
    if (!play) return;
    play.addEventListener('click', function () {
      var url = box.getAttribute('data-video');
      if (!url) {
        alert('Aún no se ha configurado el video. Cárgalo desde el panel de administración.');
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
})();
