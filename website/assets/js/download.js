(function () {
  "use strict";
  var V = window.VESSEL;
  var ICONS = "/assets/img/icons.svg#";
  var RELEASES = "https://github.com/" + V.repo + "/releases";

  // What each release file is. Order = order shown in "All downloads".
  var KINDS = [
    { id: "mac-arm64", test: /-mac-arm64\.dmg$/i, os: "mac", title: "Mac with Apple chip", sub: "M1 and later" },
    { id: "mac-x64", test: /-mac-x64\.dmg$/i, os: "mac", title: "Mac with Intel chip", sub: "Older Macs" },
    { id: "win", test: /-win\.exe$/i, os: "win", title: "Windows", sub: "Any PC, 64-bit or Arm" },
    { id: "win-x64", test: /-win-x64\.exe$/i, os: "win", title: "Windows, Intel or AMD", sub: "Smaller download" },
  ];

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function icon(name, cls) {
    return '<svg class="icon ' + (cls || "") + '"><use href="' + ICONS + name + '"/></svg>';
  }
  function mb(bytes) { return Math.round(bytes / 1048576) + " MB"; }
  function day(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
    } catch (e) { return ""; }
  }

  function files(release) {
    var out = [];
    KINDS.forEach(function (k) {
      var a = release.assets.find(function (x) { return k.test.test(x.name); });
      if (a) out.push(Object.assign({}, k, a));
    });
    return out;
  }

  // ---------- Which computer is this? ----------
  function detect() {
    var ua = navigator.userAgent || "";
    var uad = navigator.userAgentData;
    var platform = (uad && uad.platform) || navigator.platform || "";
    var os = "other";
    if (/Android|iPhone|iPod/i.test(ua)) os = "mobile";
    else if (/Mac/i.test(platform) || /Macintosh/.test(ua)) os = navigator.maxTouchPoints > 1 ? "mobile" : "mac";
    else if (/Win/i.test(platform) || /Windows/.test(ua)) os = "win";
    else if (/Linux|CrOS/i.test(platform + ua)) os = "linux";

    if (os !== "mac") return Promise.resolve({ os: os, arch: null });

    // Chrome and Edge can say which chip directly.
    var ask = uad && uad.getHighEntropyValues
      ? uad.getHighEntropyValues(["architecture"]).catch(function () { return {}; })
      : Promise.resolve({});
    return ask.then(function (h) {
      if (h.architecture === "arm") return { os: os, arch: "arm64" };
      if (h.architecture === "x86") return { os: os, arch: "x64" };
      // Firefox: the graphics card's name gives it away. Safari hides it.
      try {
        var gl = document.createElement("canvas").getContext("webgl");
        var ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
        var r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "";
        if (/Apple M\d/i.test(r)) return { os: os, arch: "arm64" };
        if (/Intel|AMD|Radeon|NVIDIA/i.test(r)) return { os: os, arch: "x64" };
      } catch (e) {}
      return { os: os, arch: null };
    });
  }

  // ---------- Render ----------
  function btn(f, primary, label) {
    return '<a class="btn ' + (primary ? "btn-gold btn-lg" : "btn-ghost btn-lg") + '" href="' + esc(f.url) + '">' +
      icon("download") + esc(label || ("Download for " + f.title)) + "</a>";
  }

  function renderPrimary(rel, list, who) {
    var by = {};
    list.forEach(function (f) { by[f.id] = f; });
    var ver = V.version(rel.tag);
    var meta = "Version " + esc(ver) + " &middot; " + esc(day(rel.date));
    var html;

    if (who.os === "mac" && (by["mac-arm64"] || by["mac-x64"])) {
      var mine = who.arch === "x64" ? by["mac-x64"] : who.arch === "arm64" ? by["mac-arm64"] : null;
      if (mine) {
        var other = mine.id === "mac-arm64" ? by["mac-x64"] : by["mac-arm64"];
        html = head("apple", "Vessel for " + mine.title, meta + " &middot; " + mb(mine.size)) +
          '<div class="btns">' + btn(mine, true, "Download for Mac") + "</div>" +
          (other ? '<p class="hint">Not right? <a href="' + esc(other.url) + '">Download for ' + esc(other.title) + "</a></p>" : "");
      } else {
        html = head("apple", "Vessel for Mac", meta) +
          '<div class="btns">' +
          (by["mac-arm64"] ? btn(by["mac-arm64"], true, "Apple chip (M1 and later)") : "") +
          (by["mac-x64"] ? btn(by["mac-x64"], false, "Intel chip") : "") +
          "</div>" +
          '<p class="hint">Not sure? Choose Apple menu, then About This Mac. "Chip" means Apple chip.</p>';
      }
    } else if (who.os === "win" && (by.win || by["win-x64"])) {
      var w = by.win || by["win-x64"];
      html = head("windows", "Vessel for Windows", meta + " &middot; " + mb(w.size)) +
        '<div class="btns">' + btn(w, true, "Download for Windows") + "</div>" +
        (by.win && by["win-x64"] ? '<p class="hint">Intel or AMD PC? There\'s a <a href="' + esc(by["win-x64"].url) + '">smaller download</a> (' + mb(by["win-x64"].size) + ").</p>" : "");
    } else {
      var why = who.os === "mobile"
        ? "Vessel runs on a Mac or Windows computer. Open this page there to download it. Your phone or iPad can be its remote."
        : "Vessel runs on Mac and Windows. Choose a download below.";
      html = head("monitor", "Vessel " + esc(ver), meta) + '<p class="muted" style="max-width:460px;margin:0 auto">' + why + "</p>";
    }
    $("primary").innerHTML = html;
  }

  function head(ic, title, meta) {
    return '<div class="os-ico">' + icon(ic) + "</div><h2>" + title + '</h2><p class="meta">' + meta + "</p>";
  }

  function renderFiles(list, who) {
    $("files").innerHTML = list.map(function (f) {
      var rec = (who.os === f.os) && (
        (f.os === "mac" && (who.arch ? f.id === "mac-" + who.arch : f.id === "mac-arm64")) ||
        (f.os === "win" && f.id === "win")
      );
      return '<a class="file' + (rec ? " rec" : "") + '" href="' + esc(f.url) + '">' +
        '<span class="os">' + icon(f.os === "mac" ? "apple" : "windows") + "</span>" +
        '<span class="txt"><b>' + esc(f.title) + (rec ? '<span class="tag">For this computer</span>' : "") + "</b>" +
        "<small>" + esc(f.sub) + " &middot; " + mb(f.size) + "</small></span>" +
        '<span class="go">' + icon("download") + "</span></a>";
    }).join("");
  }

  function renderNotes(rel) {
    $("notesTitle").textContent = rel.name;
    // The download table in the notes repeats what's above, so leave it out.
    var md = rel.body.replace(/^##\s*Download[\s\S]*?(?=^##\s)/im, "");
    var html;
    if (window.marked && window.DOMPurify) {
      html = DOMPurify.sanitize(marked.parse(md));
    } else {
      html = "<p>" + esc(md).replace(/\n{2,}/g, "</p><p>") + "</p>";
    }
    $("notes").innerHTML = html +
      '<p style="margin-top:24px"><a href="' + esc(rel.url) + '" rel="noopener">See this release on GitHub</a></p>';
  }

  function renderOlder(list) {
    var older = list.slice(0, 10);
    if (!older.length) return;
    $("older").innerHTML = older.map(function (r) {
      return '<li><a href="' + esc(r.url) + '" rel="noopener">' + esc(r.name) + "</a><span>" + esc(day(r.date)) + "</span></li>";
    }).join("");
    $("olderWrap").hidden = false;
  }

  function renderError() {
    $("primary").innerHTML = head("download", "Download from GitHub", "We couldn't load the latest version just now.") +
      '<div class="btns"><a class="btn btn-gold btn-lg" href="' + RELEASES + '/latest" rel="noopener">' + icon("external") +
      "Open the latest release</a></div>" +
      '<p class="hint">Under <b>Assets</b>, choose the file for your computer.</p>';
    $("files").innerHTML = "";
    $("notes").innerHTML = '<p>Read the notes for every version on <a href="' + RELEASES + '" rel="noopener">GitHub</a>.</p>';
  }

  // ---------- Install tabs ----------
  function selectTab(os) {
    ["mac", "win"].forEach(function (k) {
      $("tab-" + k).setAttribute("aria-selected", String(k === os));
      $("pane-" + k).hidden = k !== os;
    });
  }
  ["mac", "win"].forEach(function (k) {
    $("tab-" + k).addEventListener("click", function () { selectTab(k); });
  });

  // ---------- Go ----------
  Promise.all([V.getReleases(), detect()])
    .then(function (res) {
      var list = res[0], who = res[1];
      if (who.os === "win") selectTab("win");
      var rel = list.find(function (r) { return files(r).length; });
      if (!rel) throw new Error("No release with downloads");
      var f = files(rel);
      $("relLine").textContent = "Latest version " + V.version(rel.tag) + ", " + day(rel.date) + ".";
      renderPrimary(rel, f, who);
      renderFiles(f, who);
      renderNotes(rel);
      renderOlder(list.filter(function (r) { return r !== rel; }));
    })
    .catch(function (err) {
      console.warn("Vessel downloads:", err);
      detect().then(function (who) { if (who.os === "win") selectTab("win"); });
      renderError();
    });
})();
