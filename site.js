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
    Project category tabs.
      .project-tab[data-tab]  -> shows the .project-group[data-group] with the same key ("all" shows every group)
  */
  document.querySelectorAll('.project-tabs').forEach(function (bar) {
    var tabs = Array.prototype.slice.call(bar.querySelectorAll('.project-tab'));
    var groups = Array.prototype.slice.call(bar.parentNode.querySelectorAll('.project-group[data-group]'));

    function select(tab) {
      var key = tab.getAttribute('data-tab');
      tabs.forEach(function (t) {
        t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        t.tabIndex = t === tab ? 0 : -1;
      });
      groups.forEach(function (g) {
        var show = key === 'all' || g.getAttribute('data-group') === key;
        g.hidden = !show;
        g.classList.remove('tab-enter');
        if (show) {
          void g.offsetWidth;
          g.classList.add('tab-enter');
          g.querySelectorAll('.fade-in').forEach(function (el) { el.classList.add('visible'); });
        }
      });
    }

    tabs.forEach(function (tab, i) {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === 'Home') next = tabs[0];
        if (e.key === 'End') next = tabs[tabs.length - 1];
        if (!next) return;
        e.preventDefault();
        next.focus();
        select(next);
      });
    });
  });
})();

(function () {
  /*
    Media viewer, shared by every page.
      data-report="file.pdf"  data-report-title="..."  -> PDF viewer
      data-video="file.mp4"   data-video-title="..."   -> video player
      data-embed="page.html"  data-embed-title="..."   -> interactive page in an iframe
        data-embed-fallback / data-embed-fallback-light  -> image shown instead below 500px wide
      .gallery-item[data-full] inside [data-gallery]   -> image gallery with prev/next
    Inline figures:
      data-inline-embed="page.html" data-embed-title="..." -> swaps its static fallback for the live
        page in place, cropped to the figure, from 500px wide up
  */
  var EMBED_MIN_WIDTH = 500;

  // Same-origin figure pages carry their own light and dark palettes; keep them on the site's theme.
  function syncEmbedTheme(iframe) {
    try {
      var body = iframe.contentDocument.body;
      if (!body.hasAttribute('data-theme')) return;
      var light = document.documentElement.getAttribute('data-theme') === 'light';
      body.setAttribute('data-theme', light ? 'light' : 'dark');
    } catch (err) {}
  }

  function figureIn(doc) {
    return doc.querySelector('.iso-plate') || doc.querySelector('main');
  }

  new MutationObserver(function () {
    document.querySelectorAll('.hero-embed iframe, .media-modal-stage iframe').forEach(syncEmbedTheme);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
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

  function show(mode, navigable) {
    dialog.classList.toggle('pdf-mode', mode === 'pdf');
    dialog.classList.toggle('embed-mode', mode === 'embed');
    dialog.classList.toggle('figure-mode', mode === 'figure');
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
    show('', true);
  }

  function openReport(src, title) {
    gallery.items = [];
    stage.innerHTML = '';
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = title || 'Report';
    stage.appendChild(iframe);
    counter.textContent = title || '';
    show('pdf', false);
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
    show('', false);
  }

  function openEmbed(src, title, fallback) {
    gallery.items = [];
    stage.innerHTML = '';
    counter.textContent = title || '';
    if (fallback && window.innerWidth < EMBED_MIN_WIDTH) {
      var img = document.createElement('img');
      img.src = fallback;
      img.alt = title || '';
      stage.appendChild(img);
      show('figure', false);
      return;
    }
    var iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.title = title || 'Interactive figure';
    iframe.addEventListener('load', function () {
      // Same-origin page: centre its figure in the frame, hand it keyboard focus
      // and let Escape close the viewer from inside it.
      syncEmbedTheme(iframe);
      try {
        var doc = iframe.contentDocument;
        var focus = figureIn(doc);
        if (focus) {
          var box = focus.getBoundingClientRect();
          doc.scrollingElement.scrollTop += box.top + box.height / 2 - iframe.clientHeight / 2;
        }
        doc.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') closeModal();
        });
        (doc.querySelector('[tabindex="0"]') || iframe).focus({ preventScroll: true });
      } catch (err) {}
    });
    stage.appendChild(iframe);
    show('embed', false);
  }

  function mountInlineEmbed(holder) {
    var iframe = document.createElement('iframe');
    iframe.src = holder.getAttribute('data-inline-embed');
    iframe.title = holder.getAttribute('data-embed-title') || 'Interactive figure';
    // Page wheel scrolling passes straight through; the frame is cropped and scrolled in code.
    iframe.setAttribute('scrolling', 'no');

    function crop() {
      try {
        var doc = iframe.contentDocument;
        var figure = figureIn(doc);
        if (!figure) return;
        var gap = 16;
        var scroller = doc.scrollingElement;
        var top = figure.getBoundingClientRect().top + scroller.scrollTop;
        iframe.style.height = Math.ceil(figure.offsetHeight + gap * 2) + 'px';
        scroller.scrollTop = top - gap;
      } catch (err) {}
    }

    // The static figure stays in place until the live one has loaded and been cropped.
    iframe.addEventListener('load', function () {
      syncEmbedTheme(iframe);
      Array.prototype.slice.call(holder.children).forEach(function (child) {
        if (child !== iframe) holder.removeChild(child);
      });
      holder.classList.add('is-live');
      crop();
    });
    var pending = 0;
    window.addEventListener('resize', function () {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(crop);
    });
    holder.appendChild(iframe);
  }

  if (window.innerWidth >= EMBED_MIN_WIDTH) {
    document.querySelectorAll('[data-inline-embed]').forEach(mountInlineEmbed);
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
    var el = e.target.closest('[data-report], [data-video], [data-embed], .gallery-item[data-full]');
    if (!el || modal.contains(el)) return;
    e.preventDefault();
    if (el.hasAttribute('data-report')) {
      openReport(el.getAttribute('data-report'), el.getAttribute('data-report-title'));
    } else if (el.hasAttribute('data-embed')) {
      var light = document.documentElement.getAttribute('data-theme') === 'light';
      var fallback = (light && el.getAttribute('data-embed-fallback-light')) || el.getAttribute('data-embed-fallback');
      openEmbed(el.getAttribute('data-embed'), el.getAttribute('data-embed-title'), fallback);
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
