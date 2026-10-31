// Keep app and generated pages on the same saved theme, before first paint.
(function () {
  var theme = "light";
  try {
    if (localStorage.getItem("litellm-handoff-theme") === "dark")
      theme = "dark";
  } catch (_) {}
  document.documentElement.dataset.theme = theme;
  function updateButtons() {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute(
        "aria-label",
        "Switch to " + (theme === "dark" ? "light" : "dark") + " mode",
      );
    });
  }
  document.addEventListener("DOMContentLoaded", updateButtons);
  document.addEventListener("click", function (event) {
    if (
      !(event.target instanceof Element) ||
      !event.target.closest("[data-theme-toggle]")
    )
      return;
    theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("litellm-handoff-theme", theme);
    } catch (_) {}
    updateButtons();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape")
      document
        .querySelectorAll("details.hf-more[open]")
        .forEach(function (menu) {
          menu.open = false;
        });
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "k" &&
      !document.getElementById("app")
    ) {
      var search = document.querySelector(".hf-header-search input");
      if (search) {
        event.preventDefault();
        search.focus();
      }
    }
  });
})();
