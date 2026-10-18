/* Apply the saved (or OS-preferred) theme before first paint so the page never
   flashes the wrong theme while React boots. Mirrors the effectiveThemeKey
   logic in src/context/AppContext.jsx.

   In the desktop app the source of truth is state.edn; localStorage is a
   mirror that hydrateStore() refreshes on every load. Reading it here is what
   makes first paint theme-correct without waiting for an HTTP round trip.

   Loaded as a classic script from the page head: the app is served under
   `script-src 'self'`, so this cannot be inlined in index.html. */
(function () {
    try {
        var themeKey = null;
        // Any course storage key may hold a pinned themeKey.
        for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            try {
                var v = JSON.parse(localStorage.getItem(k));
                if (v && typeof v.themeKey === "string") {
                    themeKey = v.themeKey;
                    break;
                }
            } catch (e) {
                /* ignore unparseable entries */
            }
        }
        var dark = themeKey
            ? themeKey === "kanagawa"
            : window.matchMedia &&
              window.matchMedia("(prefers-color-scheme: dark)").matches;
        var eff = themeKey || (dark ? "kanagawa" : "gruvbox");
        var el = document.documentElement;
        el.setAttribute("data-theme", eff);
        el.classList.toggle("dark", dark);
    } catch (e) {
        /* never break first paint */
    }
})();
