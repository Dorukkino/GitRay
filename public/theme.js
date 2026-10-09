// Applies the theme saved by the theme switcher before the first paint, so the page never flashes.
try {
  var saved = localStorage.getItem("gitray-theme");
  if (saved === "light" || saved === "dark") document.documentElement.setAttribute("data-theme", saved);
} catch {}
