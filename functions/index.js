/*
 * Tide & Tackle — server-side username login.
 *
 * A player can log in with their username instead of their email. The browser
 * used to look the email up itself, which meant the email had to sit somewhere
 * a logged-out visitor could read it. This function does the lookup on
 * Google's servers instead:
 *
 *   1. usernames/{name}.uid  ->  the Firebase Auth user  ->  its email
 *   2. checks the password against Firebase Auth (same check a normal
 *      email + password sign-in does)
 *   3. returns a one-time custom token, which the game signs in with
 *
 * The email never leaves the server. Wrong usernames and wrong passwords get
 * the same answer, so the function can't be used to find out which usernames
 * have accounts beyond what the public username list already shows.
 *
 * Repeated failures on one username lock it for LOCK_MINUTES. Counters live in
 * loginThrottle/{name}, which firestore.rules keeps closed to every client.
 *
 * Deploy (needs the Blaze plan): see functions/README.md.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');

admin.initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// The game's public web API key (the same one in index.html's FB_CFG). It is
// not a secret: it only identifies the project to Firebase Auth's REST API.
const WEB_API_KEY = 'AIzaSyCGNI5snGBSfrL5c-2lRp7X-sIPqLIXmSw';
const MAX_FAILS = 8;
const LOCK_MINUTES = 15;

const BAD_LOGIN = 'Incorrect login or password.';

function badLogin() {
  return new HttpsError('unauthenticated', BAD_LOGIN);
}

// Same cleanup the game applies to usernames on sign-up.
function usernameKey(raw) {
  const k = String(raw || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return k.length >= 1 && k.length <= 40 ? k : '';
}

async function checkPassword(email, password) {
  const res = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + WEB_API_KEY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password, returnSecureToken: true }),
    }
  );
  if (res.ok) {
    const body = await res.json();
    return { ok: true, uid: body.localId };
  }
  let msg = '';
  try { msg = ((await res.json()).error || {}).message || ''; } catch (e) {}
  if (/TOO_MANY_ATTEMPTS/.test(msg)) return { ok: false, busy: true };
  if (/USER_DISABLED/.test(msg)) return { ok: false, disabled: true };
  if (/INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL|MISSING_PASSWORD/.test(msg)) {
    return { ok: false };
  }
  // Anything else is our problem, not the player's (key restrictions, outage).
  console.error('signInWithPassword failed', res.status, msg);
  throw new HttpsError('unavailable', 'Login is unavailable right now. Try logging in with your email.');
}

exports.usernameLogin = onCall(async (req) => {
  const data = req.data || {};
  const key = usernameKey(data.username);
  const password = typeof data.password === 'string' ? data.password : '';
  if (!key || !password || password.length > 200) throw badLogin();

  const db = admin.firestore();
  const throttleRef = db.collection('loginThrottle').doc(key);
  const now = Date.now();
  const throttle = (await throttleRef.get()).data() || {};
  if (throttle.lockedUntil && throttle.lockedUntil > now) {
    throw new HttpsError('resource-exhausted',
      'Too many tries. Wait ' + Math.ceil((throttle.lockedUntil - now) / 60000) + ' minutes, or reset your password.');
  }

  async function recordFail() {
    const fails = (throttle.fails || 0) + 1;
    const update = { fails: fails, lastFail: now };
    if (fails >= MAX_FAILS) { update.lockedUntil = now + LOCK_MINUTES * 60000; update.fails = 0; }
    await throttleRef.set(update, { merge: true });
  }

  const nameDoc = await db.collection('usernames').doc(key).get();
  const uid = nameDoc.exists ? (nameDoc.data() || {}).uid : null;
  if (!uid) { await recordFail(); throw badLogin(); }

  let email = null;
  try { email = (await admin.auth().getUser(uid)).email || null; } catch (e) { email = null; }
  if (!email) { await recordFail(); throw badLogin(); }

  const result = await checkPassword(email, password);
  if (result.busy) {
    throw new HttpsError('resource-exhausted', 'Too many tries. Wait a few minutes, or reset your password.');
  }
  if (result.disabled) throw new HttpsError('permission-denied', 'This account has been disabled.');
  if (!result.ok || result.uid !== uid) { await recordFail(); throw badLogin(); }

  if (throttle.fails || throttle.lockedUntil) await throttleRef.delete().catch(function () {});
  const token = await admin.auth().createCustomToken(uid);
  return { token: token };
});
