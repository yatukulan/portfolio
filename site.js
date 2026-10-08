(function () {
  var root = document.documentElement;
  var toggle = document.getElementById('themeToggle');
  if (!toggle) return;

  function isLight() {
    return root.getAttribute('data-theme') === 'light';
  }

  function updateLabel() {
    toggle.setAttribute('aria-label', isLight() ? 'Switch to dark mode' : 'Switch to light mode');
  }

  function applyTheme(light) {
    if (light) {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }
    try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
    updateLabel();
  }

  updateLabel();

  toggle.addEventListener('click', function () {
    var toLight = !isLight();
    var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var supportsViewTransitions = typeof document.startViewTransition === 'function';

    if (!supportsViewTransitions || prefersReducedMotion) {
      applyTheme(toLight);
      return;
    }

    var rect = toggle.getBoundingClientRect();
    var x = rect.left + rect.width / 2;
    var y = rect.top + rect.height / 2;
    var radius = Math.hypot(window.innerWidth, window.innerHeight) * 1.5;

    var transition = document.startViewTransition(function () {
      applyTheme(toLight);
    });

    transition.ready.then(function () {
      root.animate(
        {
          clipPath: [
            'circle(0px at ' + x + 'px ' + y + 'px)',
            'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'
          ]
        },
        {
          duration: 550,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    });
  });
})();

(function () {
  var els = document.querySelectorAll('.fade-in');
  if (!('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('visible'); });
    return;
  }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach(function (el) { observer.observe(el); });
})();

(function () {
  /*
    Media viewer, shared by every page.
      data-report="file.pdf"  data-report-title="..."  -> PDF viewer
      data-video="file.mp4"   data-video-title="..."   -> video player
      .gallery-item[data-full] inside [data-gallery]   -> image gallery with prev/next
  */
  var modal = document.createElement('div');
  modal.className = 'media-modal';
  modal.hidden = true;
  modal.innerHTML =
    '<div class="media-modal-backdrop" data-close></div>' +
    '<div class="media-modal-dialog" role="dialog" aria-modal="true" aria-label="Media viewer">' +
      '<button class="media-modal-close" type="button" data-close aria-label="Close">&times;</button>' +
      '<button class="media-modal-nav media-modal-prev" type="button" aria-label="Previous item">&#8592;</button>' +
      '<div class="media-modal-stage"></div>' +
      '<button class="media-modal-nav media-modal-next" type="button" aria-label="Next item">&#8594;</button>' +
      '<div class="media-modal-counter"></div>' +
    '</div>';
  document.body.appendChild(modal);

  var dialog = modal.querySelector('.media-modal-dialog');
  var stage = modal.querySelector('.media-modal-stage');
  var counter = modal.querySelector('.media-modal-counter');
  var prevBtn = modal.querySelector('.media-modal-prev');
  var nextBtn = modal.querySelector('.media-modal-next');
  var gallery = { items: [], index: 0 };

  function pad(n) { return String(n).padStart(2, '0'); }

  function show(pdf, navigable) {
    dialog.classList.toggle('pdf-mode', pdf);
    prevBtn.hidden = !navigable;
    nextBtn.hidden = !navigable;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function renderGallery() {
    var item = gallery.items[gallery.index];
    stage.innerHTML = '';
    var img = document.createElement('img');
    img.src = item.src;
    img.alt = item.alt;
    stage.appendChild(img);
    counter.textContent = pad(gallery.index + 1) + ' / ' + pad(gallery.items.length);
    prevBtn.disabled = nextBtn.disabled = gallery.items.length <= 1;
  }

  function openGallery(items, index) {
    gallery.items = items;
    gallery.index = index;
    renderGallery();
    show(false, true);
  }

  function openReport(src, title) {
    gallery.items = [];
    stage.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = title || 'Report';
    stage.appendChild(iframe);
    counter.textContent = title || '';
    show(true, false);
  }

  function openVideo(src, title) {
    gallery.items = [];
    stage.innerHTML = '';
    var video = document.createElement('video');
    video.src = src;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    stage.appendChild(video);
    counter.textContent = title || '';
    show(false, false);
  }

  function closeModal() {
    modal.hidden = true;
    stage.innerHTML = '';
    gallery.items = [];
    document.body.style.overflow = '';
  }

  function step(delta) {
    var n = gallery.items.length;
    if (!n) return;
    gallery.index = (gallery.index + delta + n) % n;
    renderGallery();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-report], [data-video], .gallery-item[data-full]');
    if (!el || modal.contains(el)) return;
    e.preventDefault();
    if (el.hasAttribute('data-report')) {
      openReport(el.getAttribute('data-report'), el.getAttribute('data-report-title'));
    } else if (el.hasAttribute('data-video')) {
      openVideo(el.getAttribute('data-video'), el.getAttribute('data-video-title'));
    } else {
      var buttons = Array.prototype.slice.call(el.closest('[data-gallery]').querySelectorAll('.gallery-item[data-full]'));
      var items = buttons.map(function (b) {
        var img = b.querySelector('img');
        return { src: b.getAttribute('data-full'), alt: img ? img.alt : '' };
      });
      openGallery(items, buttons.indexOf(el));
    }
  });

  modal.querySelectorAll('[data-close]').forEach(function (el) {
    el.addEventListener('click', closeModal);
  });
  prevBtn.addEventListener('click', function () { step(-1); });
  nextBtn.addEventListener('click', function () { step(1); });

  document.addEventListener('keydown', function (e) {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });
})();
