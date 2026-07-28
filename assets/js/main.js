(() => {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scroller = document.getElementById("scroller");
  const slides = Array.from(document.querySelectorAll(".slide"));
  const dotItems = Array.from(document.querySelectorAll(".dot-nav__item"));
  const counterEl = document.getElementById("slideCurrent");
  const progressFill = document.getElementById("progressFill");

  const ICON_MUTED =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
  const ICON_UNMUTED =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>';

  /* ---------------------------------------------------------------
     Stagger index: give each [data-reveal] child within a slide an
     incrementing --stagger custom property so reveals cascade in.
  --------------------------------------------------------------- */
  slides.forEach((slide) => {
    slide.querySelectorAll("[data-reveal]").forEach((el, i) => {
      el.style.setProperty("--stagger", i);
    });
  });

  /* ---------------------------------------------------------------
     Count-up stats — generalized across every slide, each element
     animates once (tracked via a WeakSet, not a single global flag).
  --------------------------------------------------------------- */
  const countedElements = new WeakSet();

  function animateCounters(slide) {
    const nums = slide.querySelectorAll("[data-count-to]");
    nums.forEach((el) => {
      if (countedElements.has(el)) return;
      countedElements.add(el);

      const to = parseFloat(el.dataset.countTo) || 0;
      const decimals = parseInt(el.dataset.decimals || el.dataset.decimal || "0", 10);
      const prefix = el.dataset.prefix || "";
      const suffix = el.dataset.suffix || "";

      if (reduceMotion) {
        el.textContent = prefix + to.toFixed(decimals) + suffix;
        return;
      }

      const duration = 1400;
      const start = performance.now();
      const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

      const step = (now) => {
        const t = Math.min((now - start) / duration, 1);
        const current = to * easeOutExpo(t);
        el.textContent = prefix + current.toFixed(decimals) + suffix;
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /* ---------------------------------------------------------------
     Sound toggle — every case-study video starts muted (autoplay
     policy); a click lets the viewer opt into real audio. Videos
     re-mute when their slide goes out of view so returning to a
     slide never resumes audio without a fresh click.
  --------------------------------------------------------------- */
  function setSoundButtonState(btn, muted) {
    if (!btn) return;
    btn.innerHTML = muted ? ICON_MUTED : ICON_UNMUTED;
    btn.setAttribute("aria-pressed", String(!muted));
  }

  document.querySelectorAll("[data-sound-toggle]").forEach((btn) => {
    const media = btn.closest(".case-media");
    const video = media && media.querySelector("video");
    if (!video) return;
    setSoundButtonState(btn, video.muted);
    btn.addEventListener("click", () => {
      video.muted = !video.muted;
      setSoundButtonState(btn, video.muted);
      if (!video.muted) {
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
      }
    });
  });

  /* ---------------------------------------------------------------
     Active-slide tracking: pick whichever slide has the greatest
     intersection ratio, sync dot-nav / counter / video playback.
  --------------------------------------------------------------- */
  const ratios = new Map();

  const setActiveSlide = (slide) => {
    slides.forEach((s) => s.classList.toggle("is-active", s === slide));

    const index = slides.indexOf(slide);
    dotItems.forEach((d, i) => d.classList.toggle("is-active", i === index));
    if (counterEl) counterEl.textContent = String(index + 1).padStart(2, "0");

    animateCounters(slide);

    const video = slide.querySelector("video");
    slides.forEach((s) => {
      if (s === slide) return;
      const v = s.querySelector("video");
      if (!v) return;
      v.pause();
      // reset to muted so a returning slide never autoplays with sound
      if (!v.muted) {
        v.muted = true;
        setSoundButtonState(s.querySelector("[data-sound-toggle]"), true);
      }
    });
    if (video) {
      const playPromise = video.play();
      if (playPromise && playPromise.catch) playPromise.catch(() => {});
    }
  };

  const initialTarget = slides.find((s) => s.id === location.hash.slice(1));
  if (slides.length) setActiveSlide(initialTarget || slides[0]);

  if (initialTarget) {
    // jump now, then re-affirm shortly after — a late web-font swap can
    // reflow section heights and leave an early scroll position stale
    const jumpToInitial = () => initialTarget.scrollIntoView({ behavior: "instant", block: "start" });
    jumpToInitial();
    window.addEventListener("load", jumpToInitial);
    setTimeout(jumpToInitial, 400);
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        ratios.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
      });
      let best = null;
      let bestRatio = 0;
      ratios.forEach((ratio, slide) => {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          best = slide;
        }
      });
      if (best) setActiveSlide(best);
    },
    { threshold: [0, 0.15, 0.3, 0.5, 0.65, 0.8, 1] }
  );
  slides.forEach((s) => io.observe(s));

  /* ---------------------------------------------------------------
     Dot navigation clicks
  --------------------------------------------------------------- */
  dotItems.forEach((dot) => {
    dot.addEventListener("click", () => {
      const target = document.getElementById(dot.dataset.target);
      if (target) target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    });
  });

  /* ---------------------------------------------------------------
     Keyboard navigation — one slide per press
  --------------------------------------------------------------- */
  window.addEventListener("keydown", (e) => {
    const activeIndex = slides.findIndex((s) => s.classList.contains("is-active"));
    if (activeIndex === -1) return;

    if (e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      const next = slides[Math.min(activeIndex + 1, slides.length - 1)];
      next.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      const prev = slides[Math.max(activeIndex - 1, 0)];
      prev.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    }
  });

  /* ---------------------------------------------------------------
     Scroll-driven progress bar + parallax (rAF throttled)
  --------------------------------------------------------------- */
  const parallaxEls = Array.from(document.querySelectorAll("[data-parallax]"));
  let ticking = false;

  const updateOnScroll = () => {
    const scrollTop = scroller.scrollTop;
    const max = scroller.scrollHeight - scroller.clientHeight;
    const pct = max > 0 ? (scrollTop / max) * 100 : 0;
    if (progressFill) progressFill.style.width = pct + "%";

    if (!reduceMotion) {
      const viewportCenter = scrollTop + scroller.clientHeight / 2;
      parallaxEls.forEach((el) => {
        const strength = parseFloat(el.dataset.parallax) || 0.2;
        const rect = el.getBoundingClientRect();
        const elCenter = rect.top + scrollTop + rect.height / 2;
        const delta = (elCenter - viewportCenter) * strength * -0.15;
        el.style.transform = `translate3d(0, ${delta}px, 0)`;
      });
    }
    ticking = false;
  };

  scroller.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(updateOnScroll);
        ticking = true;
      }
    },
    { passive: true }
  );
  updateOnScroll();

  /* ---------------------------------------------------------------
     Multi-clip switchers (F1 / KD alt cuts, Twosdays "leaked
     footage"). Clicking a thumbnail swaps the shared hero <video>
     source and plays it with sound, since a click is itself a user
     gesture. Switchers marked data-autoadvance step through every
     clip automatically, muted, looping back to the first at the end.
  --------------------------------------------------------------- */
  document.querySelectorAll("[data-clip-switcher]").forEach((switcher) => {
    const video = document.getElementById(switcher.dataset.clipSwitcher);
    if (!video) return;
    const media = video.closest(".case-media");
    const soundBtn = media && media.querySelector("[data-sound-toggle]");
    const nowPlaying = media && media.querySelector(".now-playing");
    const items = Array.from(switcher.querySelectorAll("[data-clip-src]"));
    const autoAdvance = switcher.dataset.autoadvance === "true";

    const playItem = (item, { userGesture }) => {
      const src = item.dataset.clipSrc;
      items.forEach((i) => i.classList.toggle("is-current", i === item));
      video.pause();
      video.setAttribute("poster", item.dataset.clipPoster || "");
      video.querySelector("source").setAttribute("src", src);
      video.load();
      if (userGesture) {
        video.muted = false;
        setSoundButtonState(soundBtn, false);
      }
      video.play().catch(() => {
        // autoplay-with-sound can still be blocked in some browsers;
        // fall back to a muted loop rather than a frozen frame
        video.muted = true;
        setSoundButtonState(soundBtn, true);
        video.play().catch(() => {});
      });
      if (nowPlaying) nowPlaying.textContent = item.dataset.clipLabel || "";
    };

    items.forEach((item) => {
      item.addEventListener("click", () => {
        const src = item.dataset.clipSrc;
        if (video.currentSrc && video.currentSrc.endsWith(src)) {
          video.muted = !video.muted;
          setSoundButtonState(soundBtn, video.muted);
          if (!video.muted) video.play().catch(() => {});
          return;
        }
        playItem(item, { userGesture: true });
      });
    });

    if (autoAdvance) {
      video.addEventListener("ended", () => {
        const currentIndex = items.findIndex((i) => i.classList.contains("is-current"));
        const next = items[(currentIndex + 1) % items.length];
        playItem(next, { userGesture: false });
      });
    }
  });

  /* ---------------------------------------------------------------
     Video autoplay resilience — some mobile browsers suspend
     playback on tab switch; resume when the active slide is visible.
  --------------------------------------------------------------- */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const active = slides.find((s) => s.classList.contains("is-active"));
    const video = active && active.querySelector("video");
    if (video && video.paused) video.play().catch(() => {});
  });
})();
