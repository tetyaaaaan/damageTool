(function () {
  var storageKey = "tetinet-theme";
  var root = document.documentElement;

  function getPreferredTheme() {
    var saved = localStorage.getItem(storageKey);
    if (saved === "light" || saved === "dark") return saved;
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    return "light";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-label", theme === "dark" ? "ライトモードに切り替える" : "ダークモードに切り替える");
      button.setAttribute("title", theme === "dark" ? "ライトモード" : "ダークモード");
    });
  }

  function setupMobileNavigation() {
    var headers = document.querySelectorAll(".teti-site-header");
    var mobileQuery = window.matchMedia("(max-width: 680px)");

    headers.forEach(function (header, index) {
      var inner = header.querySelector(".teti-header-inner");
      var brand = inner && inner.querySelector(".teti-brand");
      var nav = inner && inner.querySelector(".teti-nav");
      if (!inner || !brand || !nav) return;

      if (!nav.id) nav.id = index === 0 ? "tetiMainNavigation" : "tetiMainNavigation" + (index + 1);

      var button = inner.querySelector(".teti-mobile-menu-button");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "teti-mobile-menu-button";
        var icon = document.createElement("span");
        icon.className = "teti-mobile-menu-icon";
        icon.setAttribute("aria-hidden", "true");
        button.appendChild(icon);
        inner.insertBefore(button, brand);
      }
      button.setAttribute("aria-controls", nav.id);
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "メニューを開く");

      var backdrop = header.querySelector(".teti-mobile-menu-backdrop");
      if (!backdrop) {
        backdrop = document.createElement("button");
        backdrop.type = "button";
        backdrop.className = "teti-mobile-menu-backdrop";
        backdrop.setAttribute("aria-label", "メニューを閉じる");
        backdrop.hidden = true;
        header.appendChild(backdrop);
      }

      function setOpen(open, restoreFocus) {
        open = Boolean(open && mobileQuery.matches);
        header.classList.toggle("is-menu-open", open);
        document.body.classList.toggle("is-site-menu-open", open);
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
        backdrop.hidden = !open;
        nav.inert = mobileQuery.matches && !open;
        if (mobileQuery.matches) nav.setAttribute("aria-hidden", String(!open));
        else nav.removeAttribute("aria-hidden");
        if (restoreFocus) button.focus();
      }

      header.classList.add("has-mobile-navigation");
      setOpen(false, false);

      button.addEventListener("click", function () {
        setOpen(!header.classList.contains("is-menu-open"), false);
      });
      backdrop.addEventListener("click", function () { setOpen(false, true); });
      nav.addEventListener("click", function (event) {
        if (event.target.closest("a")) setOpen(false, false);
      });
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && header.classList.contains("is-menu-open")) setOpen(false, true);
      });

      var handleViewportChange = function () { setOpen(false, false); };
      if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", handleViewportChange);
      else if (mobileQuery.addListener) mobileQuery.addListener(handleViewportChange);
    });
  }

  applyTheme(getPreferredTheme());

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme(getPreferredTheme());
    setupMobileNavigation();
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
        localStorage.setItem(storageKey, next);
        applyTheme(next);
      });
    });
  });
})();
