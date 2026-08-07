# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `yarn start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `yarn test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `yarn run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `yarn run audit:all` (and the individual audits)

Drive the whole course content through a real browser to catch broken
snippets, exercises and cheat-sheet examples before learners do:

```bash
yarn audit:cheatsheet   # every runnable cheat-sheet example, per-course ns
                        # + regression values, leak checks, UI Run click-through
yarn audit:snippets     # every lesson code block evaluates cleanly
yarn audit:exercises    # every exercise solution passes its tests
yarn audit:reagent      # every live Reagent block renders via the real UI
                        # (auto-run, Run re-run, and the interactive blocks)

yarn audit:all          # all four, in sequence
```

Each audit boots the app itself (or reuses a dev server already on
`AUDIT_BASE_URL`), verifies in the per-course SCI namespaces, and exits
non-zero on any problem — so they run on CI (see
`.github/workflows/cheat-audit.yml`, which starts one server and runs all
four). `audit:reagent` is the exception to the namespace story: it drives the
Web Dev course's `{ t: "reagent" }` blocks, which render through
`renderReagent` into a live DOM node rather than `evalClojure`. It switches to
Web Dev in the UI, waits for the Reagent runtime (React 18 + the scittle
plugin), opens every lesson that contains such a block, asserts each one
auto-renders the expected text with no error, clicks the real Run button, and
clicks/types through the interactive examples (counter, form, shopping list,
to-do app) to prove Reagent reactivity.

```bash
# reuse a system browser instead of the puppeteer-bundled Chrome
CHROME_PATH=/path/to/chromium yarn audit:all

# require an already-running server; write a JSON report
AUDIT_AUTO_START=0 AUDIT_REPORT=report.json yarn audit:snippets
```

Shared env vars: `AUDIT_BASE_URL` (default `http://localhost:3000`),
`AUDIT_AUTO_START` (default `1`), `AUDIT_SERVER_TIMEOUT_MS` (default 180000),
`CHROME_PATH`, `AUDIT_REPORT`, `AUDIT_FAIL_ON_CONSOLE` (opt-in; the app logs an
intermittent warning from a third-party script — uncaught page errors always
fail). When an audit auto-starts the server, point `AUDIT_BASE_URL` at a
**free** port — CRA auto-increments a busy one, which would make the wait time
out. The `puppeteer` devDependency downloads its own Chrome during install;
skip that with `PUPPETEER_SKIP_DOWNLOAD=1` and point `CHROME_PATH` at a
system browser instead. Shared harness: `scripts/lib/audit-helpers.mjs`.

### `yarn run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `yarn run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
