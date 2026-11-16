(function () {
  "use strict";
  var D = (window.VESSEL || {}).donate || {};
  var sym = D.symbol || "$";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function link(provider, amount, monthly) {
    if (provider === "github") {
      return "https://github.com/sponsors/" + encodeURIComponent(D.githubSponsors) +
        "/sponsorships?frequency=" + (monthly ? "recurring" : "one-time") + "&amount=" + amount;
    }
    if (provider === "paypal") {
      return "https://paypal.me/" + encodeURIComponent(D.paypal) + "/" + amount + (D.currency || "USD");
    }
    if (provider === "kofi") return "https://ko-fi.com/" + encodeURIComponent(D.kofi);
    return "#";
  }

  function mount(root) {
    var providers = [];
    if (D.githubSponsors) providers.push({ id: "github", name: "GitHub Sponsors" });
    if (D.paypal) providers.push({ id: "paypal", name: "PayPal", oneOffOnly: true });
    if (D.kofi) providers.push({ id: "kofi", name: "Ko-fi" });

    if (!providers.length) {
      root.innerHTML = '<h3>Donations open soon</h3><p class="sub">Thanks for wanting to help. Check back shortly.</p>';
      return;
    }

    var amounts = D.amounts || [5, 10, 25, 50];
    var state = { amount: D.defaultAmount || amounts[0], monthly: false };
    var main = providers[0];

    root.innerHTML =
      '<h3>Support Vessel</h3>' +
      '<p class="sub">Every gift keeps Vessel free for the next church.</p>' +
      '<div class="seg" role="group" aria-label="How often">' +
        '<button type="button" data-f="once" aria-pressed="true">One time</button>' +
        '<button type="button" data-f="monthly" aria-pressed="false">Monthly</button>' +
      "</div>" +
      '<div class="amounts" role="group" aria-label="Amount">' +
        amounts.map(function (a) {
          return '<button type="button" data-a="' + a + '" aria-pressed="false">' + esc(sym + a) + "</button>";
        }).join("") +
      "</div>" +
      '<label class="custom"><span>' + esc(sym) + '</span><input type="number" inputmode="numeric" min="1" step="1" placeholder="Other amount" aria-label="Other amount"></label>' +
      '<a class="btn btn-gold btn-lg" data-go href="#" rel="noopener" target="_blank"></a>' +
      (providers.length > 1
        ? '<div class="donate-alt">Or give with ' + providers.slice(1).map(function (p) {
            return '<a data-p="' + p.id + '" href="#" rel="noopener" target="_blank">' + esc(p.name) + "</a>";
          }).join(" or ") + "</div>"
        : "") +
      '<p class="donate-fine"><svg class="icon icon-sm"><use href="/assets/img/icons.svg#lock"/></svg>Secure payment through ' + esc(main.name) + ". Vessel never sees your card.</p>";

    var go = root.querySelector("[data-go]");
    var input = root.querySelector("input");

    function update() {
      root.querySelectorAll("[data-a]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(+b.dataset.a === state.amount && !input.value));
      });
      root.querySelectorAll("[data-f]").forEach(function (b) {
        b.setAttribute("aria-pressed", String((b.dataset.f === "monthly") === state.monthly));
      });
      var ok = state.amount >= 1;
      go.innerHTML = '<svg class="icon"><use href="/assets/img/icons.svg#heart"/></svg>' +
        (ok ? "Give " + esc(sym + state.amount) + (state.monthly ? " a month" : "") : "Choose an amount");
      go.href = ok ? link(main.id, state.amount, state.monthly) : "#";
      go.toggleAttribute("aria-disabled", !ok);
      go.style.pointerEvents = ok ? "" : "none";
      go.style.opacity = ok ? "" : "0.5";
      root.querySelectorAll("[data-p]").forEach(function (a) {
        a.href = link(a.dataset.p, state.amount, state.monthly);
      });
    }

    root.addEventListener("click", function (e) {
      var a = e.target.closest("[data-a]");
      var f = e.target.closest("[data-f]");
      if (a) { state.amount = +a.dataset.a; input.value = ""; update(); }
      if (f) { state.monthly = f.dataset.f === "monthly"; update(); }
    });
    input.addEventListener("input", function () {
      var n = Math.floor(+input.value);
      state.amount = input.value === "" ? (D.defaultAmount || amounts[0]) : n > 0 ? n : 0;
      update();
    });
    update();
  }

  document.querySelectorAll("[data-donate]").forEach(mount);
})();
