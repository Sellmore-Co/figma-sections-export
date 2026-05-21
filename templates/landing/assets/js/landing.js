/**
 * landing.js — Unified section behaviors for composed landing pages.
 *
 * All behaviors are driven by data attributes. Keep generated section
 * markup on these contracts instead of creating per-section scripts.
 *
 * 1. ACCORDION
 * 2. SWIPER SLIDERS
 * 3. EXPANDABLE SECTIONS
 * 4. MODAL
 * 5. INLINE VIDEO
 * 6. COUNTDOWN TIMER
 * 7. VIDEO AUTOPLAY ON SCROLL
 */

(function () {
  'use strict';

  var ACCORDION_DURATION_MS = 300;

  function setAccordionItemState(item, isOpen, animate) {
    var panel = item.querySelector('[data-accordion-panel]');
    var toggle = item.querySelector('[data-accordion-toggle]');
    var icon = item.querySelector('[data-accordion-icon]');
    if (!panel || !toggle) return;

    item.setAttribute('data-open', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (icon) icon.classList.toggle('rotate-180', isOpen);

    if (isOpen) {
      panel.hidden = false;
      panel.style.maxHeight = '0px';
      panel.style.opacity = '0';
      requestAnimationFrame(function () {
        panel.style.maxHeight = panel.scrollHeight + 'px';
        panel.style.opacity = '1';
      });
      return;
    }

    panel.style.maxHeight = panel.scrollHeight + 'px';
    panel.style.opacity = '1';
    requestAnimationFrame(function () {
      panel.style.maxHeight = '0px';
      panel.style.opacity = '0';
    });

    if (!animate) {
      panel.hidden = true;
      return;
    }

    setTimeout(function () {
      if (item.getAttribute('data-open') === 'false') panel.hidden = true;
    }, ACCORDION_DURATION_MS);
  }

  function initAccordion(accordion) {
    if (accordion.dataset.accordionInit) return;
    accordion.dataset.accordionInit = 'true';
    var items = Array.from(accordion.querySelectorAll('[data-accordion-item]'));
    var allowMultiple = accordion.getAttribute('data-allow-multiple') === 'true';

    items.forEach(function (item) {
      var panel = item.querySelector('[data-accordion-panel]');
      var toggle = item.querySelector('[data-accordion-toggle]');
      if (!panel || !toggle) return;

      panel.style.overflow = 'hidden';
      panel.style.transition = 'max-height ' + ACCORDION_DURATION_MS + 'ms ease, opacity ' + ACCORDION_DURATION_MS + 'ms ease';
      setAccordionItemState(item, item.getAttribute('data-open') === 'true', false);

      toggle.addEventListener('click', function () {
        var isOpen = item.getAttribute('data-open') === 'true';
        if (!allowMultiple) {
          items.forEach(function (other) {
            if (other !== item && other.getAttribute('data-open') === 'true') {
              setAccordionItemState(other, false, true);
            }
          });
        }
        setAccordionItemState(item, !isOpen, true);
      });
    });
  }

  document.querySelectorAll('[data-accordion]').forEach(initAccordion);

  if (typeof Swiper !== 'undefined') {
    document.querySelectorAll('[data-swiper]').forEach(function (sliderEl) {
      var root = sliderEl.closest('[data-swiper-root]') || sliderEl.parentElement || sliderEl;
      if (sliderEl.dataset.swiperInit) return;
      sliderEl.dataset.swiperInit = 'true';

      function getNum(attr, fallback) {
        var val = root.getAttribute(attr);
        return val !== null ? parseFloat(val) : fallback;
      }

      function getBool(attr, fallback) {
        var val = root.getAttribute(attr);
        return val !== null ? val === 'true' : fallback;
      }

      var slidesBase = getNum('data-slides', 1);
      var slidesMd = getNum('data-slides-md', slidesBase);
      var slidesLg = getNum('data-slides-lg', slidesMd);
      var gapBase = getNum('data-gap', 16);
      var gapMd = getNum('data-gap-md', gapBase);
      var gapLg = getNum('data-gap-lg', gapMd);
      var loopBase = getBool('data-loop', false);
      var loopMd = getBool('data-loop-md', loopBase);
      var loopLg = getBool('data-loop-lg', loopMd);
      var controlsEl = root.querySelector('[data-swiper-controls]');

      function syncControls(swiper) {
        if (controlsEl) controlsEl.classList.toggle('hidden', !!swiper.isLocked);
      }

      new Swiper(sliderEl, {
        slidesPerView: slidesBase,
        spaceBetween: gapBase,
        loop: loopBase,
        watchOverflow: getBool('data-watch-overflow', false),
        breakpoints: {
          768: { slidesPerView: slidesMd, spaceBetween: gapMd, loop: loopMd },
          1024: { slidesPerView: slidesLg, spaceBetween: gapLg, loop: loopLg }
        },
        pagination: {
          el: root.querySelector('.swiper-pagination'),
          clickable: true
        },
        navigation: {
          nextEl: root.querySelector('[data-swiper-next]'),
          prevEl: root.querySelector('[data-swiper-prev]')
        },
        on: {
          init: function () { syncControls(this); },
          breakpoint: function () { syncControls(this); },
          resize: function () { syncControls(this); },
          lock: function () { syncControls(this); },
          unlock: function () { syncControls(this); }
        }
      });
    });
  }

  document.querySelectorAll('[data-expandable]').forEach(function (root) {
    var toggle = root.querySelector('[data-expandable-toggle]');
    var panel = root.querySelector('[data-expandable-panel]');
    if (!toggle || !panel) return;

    var label = root.querySelector('[data-expandable-label]');
    var chevron = root.querySelector('[data-expandable-chevron]');
    var open = false;

    panel.style.maxHeight = '0px';
    panel.style.overflow = 'hidden';
    panel.style.transition = panel.style.transition || 'max-height 0.4s ease';

    toggle.addEventListener('click', function () {
      open = !open;
      panel.style.maxHeight = open ? panel.scrollHeight + 'px' : '0px';
      if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
      if (label) {
        label.textContent = open
          ? (label.dataset.labelClose || label.textContent)
          : (label.dataset.labelOpen || label.textContent);
      }
    });
  });

  var modalTriggers = document.querySelectorAll('[data-modal-trigger]');
  if (modalTriggers.length) {
    var overlay = document.createElement('div');
    overlay.setAttribute('data-modal-overlay', '');
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80';
    overlay.style.cssText = 'opacity:0;pointer-events:none;transition:opacity 0.2s ease;';
    overlay.innerHTML = [
      '<div class="relative w-full max-w-4xl">',
      '<button type="button" data-modal-close class="absolute -top-10 right-0 flex items-center justify-center w-10 h-10 bg-transparent border-0 cursor-pointer rounded-full hover:bg-white/20" aria-label="Close modal">',
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      '</button>',
      '<div data-modal-content class="w-full rounded-xl overflow-hidden bg-black"></div>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    var modalContent = overlay.querySelector('[data-modal-content]');

    function openModal(type, src, target) {
      modalContent.innerHTML = '';
      if (type === 'video') {
        var vid = document.createElement('video');
        vid.src = src;
        vid.controls = true;
        vid.autoplay = true;
        vid.playsInline = true;
        vid.className = 'w-full max-h-[80vh]';
        modalContent.appendChild(vid);
      } else if (type === 'image') {
        var img = document.createElement('img');
        img.src = src;
        img.className = 'w-full h-auto block';
        modalContent.appendChild(img);
      } else if (type === 'html') {
        var el = target ? document.querySelector(target) : null;
        if (el) modalContent.innerHTML = el.innerHTML;
      }
      overlay.style.opacity = '1';
      overlay.style.pointerEvents = 'auto';
      document.body.style.overflow = 'hidden';
    }

    function closeModal() {
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      document.body.style.overflow = '';
      setTimeout(function () {
        if (overlay.style.opacity === '0') modalContent.innerHTML = '';
      }, 200);
    }

    modalTriggers.forEach(function (trigger) {
      trigger.addEventListener('click', function (event) {
        event.preventDefault();
        openModal(
          trigger.getAttribute('data-modal-type') || 'video',
          trigger.getAttribute('data-modal-src') || '',
          trigger.getAttribute('data-modal-target') || ''
        );
      });
    });

    overlay.querySelector('[data-modal-close]').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (event) {
      if (event.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeModal();
    });
  }

  document.querySelectorAll('[data-video-inline]').forEach(function (root) {
    var src = root.getAttribute('data-video-src');
    if (!src) return;

    root.addEventListener('click', function () {
      var vid = document.createElement('video');
      vid.src = src;
      vid.controls = true;
      vid.autoplay = true;
      vid.playsInline = true;
      vid.className = 'w-full h-full object-cover';
      root.innerHTML = '';
      root.appendChild(vid);
      var playPromise = vid.play();
      if (playPromise && playPromise.catch) playPromise.catch(function () {});
    }, { once: true });
  });

  document.querySelectorAll('[data-countdown]').forEach(function (root) {
    var storageKey = root.getAttribute('data-storage-key') || 'landing-countdown';
    var durationMs = (parseFloat(root.getAttribute('data-duration-minutes')) || 15) * 60 * 1000;

    function getEndTime() {
      var stored = localStorage.getItem(storageKey);
      if (stored) {
        var t = parseInt(stored, 10);
        if (t > Date.now()) return t;
      }
      var end = Date.now() + durationMs;
      localStorage.setItem(storageKey, end.toString());
      return end;
    }

    function pad(n) { return n < 10 ? '0' + n : '' + n; }

    function tick() {
      var remaining = Math.max(0, getEndTime() - Date.now());
      var totalSec = Math.floor(remaining / 1000);
      var hrs = Math.floor(totalSec / 3600);
      var min = Math.floor((totalSec % 3600) / 60);
      var sec = totalSec % 60;

      root.querySelectorAll('[data-countdown-hrs]').forEach(function (el) { el.textContent = pad(hrs); });
      root.querySelectorAll('[data-countdown-min]').forEach(function (el) { el.textContent = pad(min); });
      root.querySelectorAll('[data-countdown-sec]').forEach(function (el) { el.textContent = pad(sec); });

      if (remaining > 0) setTimeout(tick, 1000);
    }

    tick();
  });

  var ambientVideos = document.querySelectorAll('video');
  if (ambientVideos.length && 'IntersectionObserver' in window) {
    ambientVideos.forEach(function (video) {
      video.pause();
      video.muted = true;
      video.playsInline = true;
      video.autoplay = false;
    });

    var videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var playPromise = entry.target.play();
          if (playPromise && playPromise.catch) playPromise.catch(function () {});
        } else {
          entry.target.pause();
        }
      });
    }, { threshold: 0.35 });

    ambientVideos.forEach(function (video) { videoObserver.observe(video); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) ambientVideos.forEach(function (video) { video.pause(); });
    });
  }
}());
