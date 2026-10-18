# Vendored assets

## htmx

- File: `htmx.min.js` (unmodified)
- Version: 2.0.11, from the `htmx.org` npm package (`dist/htmx.min.js`)
- License: Zero-Clause BSD — see `htmx-LICENSE.txt`

Course 2's capstone embeds a small Ring app whose interactions are HTMX requests.
The file is committed and served from the app (`/vendor/htmx.min.js`) so the app
never fetches anything from a CDN. Bump it deliberately: the smoke test drives the
capstone's attributes and out-of-band swap against this version.
