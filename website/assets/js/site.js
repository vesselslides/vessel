(function () {
  "use strict";
  var V = window.VESSEL || {};

  // Header border on scroll
  var header = document.querySelector(".site-header");
  function onScroll() {
    if (header) header.classList.toggle("scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile nav
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  // Reveal on scroll
  var els = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { el.classList.add("in"); });
  }

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  // ---------- GitHub releases (shared by the home and download pages) ----------
  var CACHE_KEY = "vessel:releases:v1";
  var CACHE_MS = 10 * 60 * 1000;

  function readCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      return Date.now() - c.t < CACHE_MS ? c.d : null;
    } catch (e) { return null; }
  }
  function writeCache(d) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
  }

  var pending = null;
  V.getReleases = function () {
    if (pending) return pending;
    var cached = readCache();
    if (cached) return (pending = Promise.resolve(cached));
    var url = "https://api.github.com/repos/" + V.repo + "/releases?per_page=20";
    pending = fetch(url, { headers: { Accept: "application/vnd.github+json" } })
      .then(function (r) {
        if (!r.ok) throw new Error("GitHub said " + r.status);
        return r.json();
      })
      .then(function (list) {
        // Keep only what the page needs, so the cache stays small.
        var slim = list
          .filter(function (r) { return !r.draft && !r.prerelease; })
          .map(function (r) {
            return {
              tag: r.tag_name,
              name: r.name || r.tag_name,
              url: r.html_url,
              date: r.published_at,
              body: r.body || "",
              assets: (r.assets || []).map(function (a) {
                return { name: a.name, size: a.size, url: a.browser_download_url };
              }),
            };
          });
        writeCache(slim);
        return slim;
      })
      .catch(function (err) {
        pending = null;
        throw err;
      });
    return pending;
  };

  V.version = function (tag) { return String(tag || "").replace(/^v/i, ""); };

  // Fill any [data-latest-version] element with the newest version number.
  var verEls = document.querySelectorAll("[data-latest-version]");
  if (verEls.length && V.repo) {
    V.getReleases()
      .then(function (list) {
        if (!list.length) return;
        verEls.forEach(function (el) { el.textContent = V.version(list[0].tag); });
        document.querySelectorAll("[data-latest-show]").forEach(function (el) { el.hidden = false; });
      })
      .catch(function () {});
  }
})();
