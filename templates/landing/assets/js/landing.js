/**
 * landing.js — Unified section behaviors for composed landing pages.
 *
 * All behaviors are driven purely by data attributes — no section-specific
 * selectors or class names. Sections run in order at script execution time
 * (script is loaded at the bottom of <body>, so DOM is ready).
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

  /* ─────────────────────────────────────────────────────────────────────
   * 1. ACCORDION
   *
   * Markup contract:
   *   [data-accordion]               — wrapper; opt: data-allow-multiple="true"
   *   [data-accordion-item]          — each row; data-open="true|false"
   *   [data-accordion-toggle]        — clickable button inside the row
   *   [data-accordion-panel]         — collapsible content area
   *   [data-accordion-icon]          — optional chevron (gets rotate-180 class)
   * ───────────────────────────────────────────────────────────────────── */

  var ACCORDION_DURATION_MS = 300;

  function setAccordionItemState(item, isOpen, animate) {
    var panel  = item.querySelector('[data-accordion-panel]');
    var toggle = item.querySelector('[data-accordion-toggle]');
    var icon   = item.querySelector('[data-accordion-icon]');
    if (!panel || !toggle) return;

    item.setAttribute('data-open', isOpen ? 'true' : 'false');
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (icon) icon.classList.toggle('rotate-180', isOpen);
    item.querySelectorAll('[data-faq-vbar]').forEach(function (vbar) {
      vbar.style.opacity = isOpen ? '0' : '1';
    });

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

    if (!animate) { panel.hidden = true; return; }

    setTimeout(function () {
      if (item.getAttribute('data-open') === 'false') panel.hidden = true;
    }, ACCORDION_DURATION_MS);
  }

  function initAccordion(accordion) {
    if (accordion.dataset.accordionInit) return;
    accordion.dataset.accordionInit = 'true';
    var items = Array.from(accordion.querySelectorAll('[data-accordion-item]'));
    if (!items.length) return;
    var allowMultiple = accordion.getAttribute('data-allow-multiple') === 'true';

    items.forEach(function (item) {
      var panel  = item.querySelector('[data-accordion-panel]');
      var toggle = item.querySelector('[data-accordion-toggle]');
      if (!panel || !toggle) return;

      panel.style.overflow   = 'hidden';
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

  // Backward-compat: some imported sections may have accordion item markup
  // without a [data-accordion] wrapper. Promote their parent as wrapper.
  document.querySelectorAll('[data-accordion-item]').forEach(function (item) {
    var wrapper = item.closest('[data-accordion]') || item.parentElement;
    if (!wrapper) return;
    if (!wrapper.hasAttribute('data-accordion')) wrapper.setAttribute('data-accordion', '');
    if (!wrapper.hasAttribute('data-allow-multiple')) wrapper.setAttribute('data-allow-multiple', 'false');
    initAccordion(wrapper);
  });


  /* ─────────────────────────────────────────────────────────────────────
   * 2. SWIPER SLIDERS
   *
   * Markup contract on [data-swiper-root]:
   *   data-slides          slidesPerView mobile   (default: 1)
   *   data-slides-md       slidesPerView 768px+   (default: data-slides)
   *   data-slides-lg       slidesPerView 1024px+  (default: data-slides-md)
   *   data-gap             spaceBetween mobile px  (default: 16)
   *   data-gap-md          spaceBetween 768px+
   *   data-gap-lg          spaceBetween 1024px+
   *   data-loop            loop mobile             (default: false)
   *   data-loop-md         loop 768px+             (default: data-loop)
   *   data-loop-lg         loop 1024px+            (default: data-loop-md)
   *   data-centered        centeredSlides mobile   (default: false)
   *   data-centered-md     centeredSlides 768px+   (default: false)
   *   data-centered-lg     centeredSlides 1024px+  (default: false)
   *   data-watch-overflow  hide controls when all slides fit (default: false)
   *
   * Inside [data-swiper-root]:
   *   [data-swiper]          the .swiper element
   *   [data-swiper-prev]     prev button
   *   [data-swiper-next]     next button
   *   [data-swiper-controls] wrapper hidden when slider is locked (optional)
   *   .swiper-pagination     pagination dots container (optional)
   * ───────────────────────────────────────────────────────────────────── */

  if (typeof Swiper !== 'undefined') {
    function hasLegacySwiperDataAttr(el) {
      if (!el || !el.attributes) return false;
      for (var i = 0; i < el.attributes.length; i++) {
        var name = el.attributes[i].name;
        if (name.indexOf('data-') === 0 && name.indexOf('swiper') !== -1) return true;
      }
      return false;
    }

    function findSwiperRoot(sliderEl) {
      var node = sliderEl;
      while (node && node !== document.body) {
        if (node.hasAttribute && node.hasAttribute('data-swiper-root')) return node;
        if (node !== sliderEl && hasLegacySwiperDataAttr(node)) return node;
        node = node.parentElement;
      }
      return sliderEl.parentElement || sliderEl;
    }

    var roots = [];
    var seen = new Set();
    document.querySelectorAll('[data-swiper]').forEach(function (sliderEl) {
      var root = findSwiperRoot(sliderEl);
      if (!root) return;
      if (seen.has(root)) return;
      seen.add(root);
      roots.push(root);
    });

    roots.forEach(function (root) {
      var sliderEl = root.querySelector('[data-swiper]');
      if (!sliderEl) return;

      function getNum(attr, fallback) {
        var val = root.getAttribute(attr);
        return val !== null ? parseFloat(val) : fallback;
      }
      function getBool(attr, fallback) {
        var val = root.getAttribute(attr);
        return val !== null ? val === 'true' : fallback;
      }

      var slidesBase = getNum('data-slides', 1);
      var slidesMd   = getNum('data-slides-md', slidesBase);
      var slidesLg   = getNum('data-slides-lg', slidesMd);
      var gapBase    = getNum('data-gap', 16);
      var gapMd      = getNum('data-gap-md', gapBase);
      var gapLg      = getNum('data-gap-lg', gapMd);
      var loopBase   = getBool('data-loop', false);
      var loopMd     = getBool('data-loop-md', loopBase);
      var loopLg     = getBool('data-loop-lg', loopMd);
      var centBase   = getBool('data-centered', false);
      var centMd     = getBool('data-centered-md', false);
      var centLg     = getBool('data-centered-lg', false);
      var watchOverflow = getBool('data-watch-overflow', false);

      var controlsEl = root.querySelector('[data-swiper-controls]');

      function syncControls(swiper) {
        if (!controlsEl) return;
        controlsEl.classList.toggle('hidden', !!swiper.isLocked);
      }

      var config = {
        slidesPerView:  slidesBase,
        spaceBetween:   gapBase,
        loop:           loopBase,
        centeredSlides: centBase,
        watchOverflow:  watchOverflow,
        breakpoints: {
          768: {
            slidesPerView:  slidesMd,
            spaceBetween:   gapMd,
            loop:           loopMd,
            centeredSlides: centMd
          },
          1024: {
            slidesPerView:  slidesLg,
            spaceBetween:   gapLg,
            loop:           loopLg,
            centeredSlides: centLg
          }
        },
        pagination: {
          el:        root.querySelector('.swiper-pagination'),
          clickable: true
        },
        navigation: {
          nextEl: root.querySelector('[data-swiper-next]'),
          prevEl: root.querySelector('[data-swiper-prev]')
        }
      };

      if (watchOverflow || controlsEl) {
        config.on = {
          init:       function () { syncControls(this); },
          breakpoint: function () { syncControls(this); },
          resize:     function () { syncControls(this); },
          lock:       function () { syncControls(this); },
          unlock:     function () { syncControls(this); }
        };
      }

      new Swiper(sliderEl, config);
    });
  }


  /* ─────────────────────────────────────────────────────────────────────
   * 3. EXPANDABLE SECTIONS
   *
   * Markup contract on [data-expandable]:
   *   [data-expandable-panel]    — the collapsible content block
   *   [data-expandable-toggle]   — the button that opens/closes it
   *   [data-expandable-label]    — optional; text node swapped on toggle
   *     data-label-open="..."      text when closed
   *     data-label-close="..."     text when open
   *   [data-expandable-chevron]  — optional; gets rotate(180deg) when open
   * ───────────────────────────────────────────────────────────────────── */

  document.querySelectorAll('[data-expandable]').forEach(function (root) {
    var toggle  = root.querySelector('[data-expandable-toggle]');
    var panel   = root.querySelector('[data-expandable-panel]');
    if (!toggle || !panel) return;

    var label   = root.querySelector('[data-expandable-label]');
    var chevron = root.querySelector('[data-expandable-chevron]');
    var open    = false;

    toggle.addEventListener('click', function () {
      open = !open;
      panel.style.maxHeight = open ? panel.scrollHeight + 'px' : '0';
      if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
      if (label) {
        label.textContent = open
          ? (label.dataset.labelClose || label.textContent)
          : (label.dataset.labelOpen  || label.textContent);
      }
    });
  });


  /* ─────────────────────────────────────────────────────────────────────
   * 4. MODAL
   *
   * Markup contract on triggers:
   *   data-modal-trigger             — any clickable element opens the modal
   *   data-modal-type="video"        — plays an MP4 URL in a <video> element
   *   data-modal-type="image"        — displays an image
   *   data-modal-type="html"         — clones inner HTML of data-modal-target selector
   *   data-modal-src="https://..."   — URL for video or image types
   *   data-modal-target="#selector"  — CSS selector for html type
   * ───────────────────────────────────────────────────────────────────── */

  var modalTriggers = document.querySelectorAll('[data-modal-trigger]');
  if (modalTriggers.length) {
    var overlay = document.createElement('div');
    overlay.setAttribute('data-modal-overlay', '');
    overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80';
    overlay.style.cssText = 'opacity:0;pointer-events:none;transition:opacity 0.2s ease;';
    overlay.innerHTML = [
      '<div role="dialog" aria-modal="true" aria-label="Media viewer" class="relative w-full max-w-4xl">',
        '<button data-modal-close class="absolute -top-10 right-0 flex items-center justify-center w-10 h-10 bg-transparent border-0 cursor-pointer rounded-full hover:bg-white/20">',
        '  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        '</button>',
        '<div data-modal-content class="w-full rounded-xl overflow-hidden bg-black"></div>',
      '</div>',
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
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(
          trigger.getAttribute('data-modal-type') || 'video',
          trigger.getAttribute('data-modal-src')  || '',
          trigger.getAttribute('data-modal-target') || ''
        );
      });
    });

    overlay.querySelector('[data-modal-close]').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });
  }


  /* ─────────────────────────────────────────────────────────────────────
   * 5. INLINE VIDEO
   *
   * Markup contract on [data-video-inline]:
   *   data-video-src="https://..."  — MP4 URL to play in-place
   *
   * On click, replaces the container's contents with an autoplaying
   * <video> that fills the same space. Use when the video should play
   * inside the thumbnail slot rather than opening a modal.
   * ───────────────────────────────────────────────────────────────────── */

  document.querySelectorAll('[data-video-inline]').forEach(function (root) {
    var src = root.getAttribute('data-video-src');
    if (!src) return;

    root.addEventListener('click', function handler() {
      var original = root.innerHTML;
      function restore() {
        root.innerHTML = original;
        root.addEventListener('click', handler, { once: true });
      }
      var vid = document.createElement('video');
      vid.src = src;
      vid.controls = true;
      vid.autoplay = true;
      vid.playsInline = true;
      vid.className = 'w-full h-full object-cover';
      vid.addEventListener('error', restore, { once: true });
      root.innerHTML = '';
      root.appendChild(vid);
      var p = vid.play();
      if (p && p.catch) p.catch(restore);
    }, { once: true });
  });


  /* ─────────────────────────────────────────────────────────────────────
   * 6. COUNTDOWN TIMER
   *
   * Markup contract:
   *   [data-countdown]           — wrapper; data-duration-minutes="15" (default: 15)
   *                                           data-storage-key="my-countdown" (default: "landing-countdown")
   *   [data-countdown-hrs]       — element whose textContent gets hours
   *   [data-countdown-min]       — element whose textContent gets minutes
   *   [data-countdown-sec]       — element whose textContent gets seconds
   * ───────────────────────────────────────────────────────────────────── */

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
      var totalSec  = Math.floor(remaining / 1000);
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


  /* ─────────────────────────────────────────────────────────────────────
   * 7. VIDEO AUTOPLAY ON SCROLL
   *
   * Handles ambient <video> elements that exist in the DOM at page load
   * (e.g. background/loop videos in sections). Plays when ~35% visible,
   * pauses when not. Does NOT affect videos created dynamically by the
   * modal (section 4) or inline video (section 5) handlers.
   *
   * Add loading="lazy" to <video> tags to defer network download.
   * ───────────────────────────────────────────────────────────────────── */

  var ambientVideos = document.querySelectorAll('video');
  if (ambientVideos.length && ('IntersectionObserver' in window)) {
    ambientVideos.forEach(function (v) {
      v.pause();
      v.muted = true;
      v.playsInline = true;
      v.autoplay = false;
    });

    var videoObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var p = entry.target.play();
          if (p && p.catch) p.catch(function () {});
        } else {
          entry.target.pause();
        }
      });
    }, { threshold: 0.35 });

    ambientVideos.forEach(function (v) { videoObserver.observe(v); });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) ambientVideos.forEach(function (v) { v.pause(); });
    });
  }

}());
