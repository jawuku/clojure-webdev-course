import { debug } from "./log";
import { runtimeRequest } from "./runtime";

/*
 * One store API for learner state.
 *
 * In the desktop app the source of truth is `state.edn` in the platform
 * app-data directory, served by `GET/PUT /api/state`. localStorage is kept as
 * a mirror for two reasons only:
 *
 *   1. `theme-init.js` runs before the first paint and needs a synchronous
 *      read, and
 *   2. in a plain browser (`yarn dev`, or a server that has gone away) there
 *      is no state API, so the mirror is the fallback store.
 *
 * `hydrateStore()` runs once before React renders: it copies every bucket
 * from `state.edn` into the mirror, and on the first launch after upgrading
 * from the localStorage-only build it uploads the existing buckets.
 */

// The keys the app has always used. Both prefixes appear in the wild:
// `parens_*` for the app and `regex_*` for the standalone Regex course.
const BUCKET_KEY = /^(?:parens_|regex_)[A-Za-z0-9_.-]{0,72}$/;

export function isBucketKey(key) {
  return typeof key === "string" && BUCKET_KEY.test(key);
}

// Old values were written raw (`parens_active_course_v1` = "clojure",
// `__celebrated` = "1"); everything newer is JSON. Accept both.
function parseLocal(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function readBucket(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = parseLocal(raw);
    return value === undefined ? fallback : value;
  } catch (e) {
    debug("store: could not read localStorage", e);
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    debug("store: could not write the localStorage mirror", e);
  }
}

function removeLocal(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    debug("store: could not clear the localStorage mirror", e);
  }
}

// Writes are queued so a burst of changes cannot arrive out of order. A failed
// save is debug-logged (production is silent) and never breaks the UI: the
// mirror already holds the value.
let pending = Promise.resolve();

function saveRemote(key, value) {
  if (!isBucketKey(key)) return pending;
  pending = pending.then(async () => {
    try {
      await runtimeRequest("/api/state", {
        method: "PUT",
        body: { key, value },
        timeoutMs: 5000,
        // A write issued just before the window closes should still land.
        keepalive: true,
      });
    } catch (e) {
      debug("store: could not save state.edn (localStorage mirror kept)", e);
    }
  });
  return pending;
}

async function saveRemoteNow(key, value) {
  try {
    await runtimeRequest("/api/state", {
      method: "PUT",
      body: { key, value },
      timeoutMs: 5000,
    });
    return true;
  } catch (e) {
    debug("store: could not import a localStorage bucket", e);
    return false;
  }
}

/** Persist one bucket: mirror immediately, then the app-data file. */
export function writeBucket(key, value) {
  writeLocal(key, value);
  saveRemote(key, value);
}

/** Delete one bucket from both stores (a nil write deletes server-side). */
export function removeBucket(key) {
  removeLocal(key);
  saveRemote(key, null);
}

/**
 * Merge the app-data file into the mirror before the app renders. Returns true
 * when the file answered; false means the browser fallback is in charge.
 */
export async function hydrateStore({ timeoutMs = 1500 } = {}) {
  let response;
  try {
    response = await runtimeRequest("/api/state", { method: "GET", timeoutMs });
  } catch (e) {
    debug("store: state.edn API unavailable; using the localStorage mirror", e);
    return false;
  }

  if (!response || response.ok !== true || !response.state || typeof response.state !== "object") {
    debug("store: unexpected /api/state response; using the localStorage mirror");
    return false;
  }

  const remote = response.state;
  const remoteKeys = Object.keys(remote).filter(isBucketKey);

  const localKeys = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (isBucketKey(key)) localKeys.push(key);
    }
  } catch (e) {
    debug("store: could not enumerate the localStorage mirror", e);
  }

  // Server wins: it is the file the desktop app owns.
  for (const key of remoteKeys) writeLocal(key, remote[key]);

  // First launch after upgrading from the localStorage-only build: state.edn
  // does not exist yet, so upload the existing buckets once.
  if (remoteKeys.length === 0) {
    for (const key of localKeys) {
      const value = readBucket(key, undefined);
      if (value !== undefined) await saveRemoteNow(key, value);
    }
  }

  return true;
}
