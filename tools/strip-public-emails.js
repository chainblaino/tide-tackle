#!/usr/bin/env node
/*
 * Tide & Tackle — move player emails off public Firestore docs.
 *
 * Background: users/{uid}.email and usernames/{username}.email were readable
 * by every signed-in player. Username login now reads loginEmails/{username}
 * (single get, no list). Firebase Auth is left alone: the real address stays
 * the sign-in / password-reset email. This script does not change Auth users,
 * passwords, saves, friends, or leaderboard docs.
 *
 * DO NOT RUN until firestore.rules from the same change are published and the
 * updated index.html is what players load. Dry-run is the default and writes
 * nothing. This file was added so Garrett can run it; it is not run by the
 * patch that introduced it.
 *
 * Setup: same service account as give-currency.js (tools/serviceAccount.json,
 * git-ignored). From this directory: npm install firebase-admin
 *
 * Usage:
 *   node strip-public-emails.js            # dry-run, prints a plan
 *   node strip-public-emails.js --apply    # writes the plan
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const KEY_PATH = path.join(__dirname, 'serviceAccount.json');

function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at <= 0) return '(none)';
  return s.slice(0, 1) + '***@' + s.slice(at + 1);
}

function die(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

if (!fs.existsSync(KEY_PATH)) {
  die('Missing tools/serviceAccount.json. Download it from Firebase console → Project settings → Service accounts → Generate new private key. Do not commit it.');
}

const serviceAccount = require(KEY_PATH);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const auth = admin.auth();

async function eachDoc(collName, fn) {
  const coll = db.collection(collName);
  let last = null;
  for (;;) {
    let q = coll.orderBy(admin.firestore.FieldPath.documentId()).limit(300);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) await fn(doc);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 300) break;
  }
}

// Auth is the address signInWithEmailAndPassword actually checks. A missing
// Auth user is not fatal (fall back to the Firestore copy). Any other error
// aborts before writes so a blip cannot strip emails we failed to copy.
async function authEmail(uid) {
  try {
    const user = await auth.getUser(uid);
    return (user.email || '').trim();
  } catch (err) {
    if (err && err.code === 'auth/user-not-found') return '';
    throw err;
  }
}

async function loadLoginEmails(keys) {
  const out = new Map();
  const refs = keys.map(function (k) { return db.collection('loginEmails').doc(k); });
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100);
    if (!chunk.length) continue;
    const snaps = await db.getAll.apply(db, chunk);
    snaps.forEach(function (s) { out.set(s.id, s.exists ? s.data() : null); });
  }
  return out;
}

function sameLogin(data, uid, email) {
  if (!data) return false;
  const keys = Object.keys(data);
  return keys.length === 2 && keys.indexOf('uid') !== -1 && keys.indexOf('email') !== -1
    && data.uid === uid && data.email === email;
}

async function main() {
  const projectId = serviceAccount.project_id || '(unknown project)';
  console.log(APPLY ? 'APPLY — writing to ' + projectId : 'DRY RUN — no writes. Project: ' + projectId);
  console.log('Auth users are not modified. Pass --apply to write.\n');

  const upserts = new Map(); // username key -> {uid, email, source}
  const strips = []; // {coll, id, label}
  const warnings = [];
  const uidKey = new Map(); // uid -> username doc id
  let usernameDocs = 0;
  let userDocs = 0;

  function queueUpsert(key, uid, email, source) {
    if (!key || !uid || !email) return;
    const prev = upserts.get(key);
    if (prev && prev.uid !== uid) {
      warnings.push('loginEmails/' + key + ' is claimed by two uids (' + prev.uid + ' and ' + uid + '). Keeping the first.');
      return;
    }
    if (!prev) upserts.set(key, { uid: uid, email: email, source: source });
  }

  await eachDoc('usernames', async function (doc) {
    usernameDocs++;
    const data = doc.data() || {};
    const uid = typeof data.uid === 'string' ? data.uid : '';
    const stored = typeof data.email === 'string' ? data.email.trim() : '';
    if (uid) uidKey.set(uid, doc.id);
    let email = stored;
    if (uid) {
      const fromAuth = await authEmail(uid);
      if (fromAuth) email = fromAuth;
    }
    if (stored && fromAuthDiffers(stored, email)) {
      warnings.push('usernames/' + doc.id + ' stored ' + maskEmail(stored) + ' but Auth is ' + maskEmail(email) + '. Login map will use Auth.');
    }
    if (uid && email) queueUpsert(doc.id, uid, email, 'usernames/' + doc.id);
    if (Object.prototype.hasOwnProperty.call(data, 'email')) {
      if (!uid && stored) {
        warnings.push('LEFT IN PLACE usernames/' + doc.id + ': has an email but no uid, so it was not copied.');
      } else {
        strips.push({ coll: 'usernames', id: doc.id, label: 'usernames/' + doc.id + '.email' });
      }
    }
  });

  await eachDoc('users', async function (doc) {
    userDocs++;
    const data = doc.data() || {};
    const uid = doc.id;
    const stored = typeof data.email === 'string' ? data.email.trim() : '';
    const hasEmail = Object.prototype.hasOwnProperty.call(data, 'email');
    if (!hasEmail && !data.username) return;
    let email = stored;
    const fromAuth = await authEmail(uid);
    if (fromAuth) email = fromAuth;
    if (stored && email && stored.toLowerCase() !== email.toLowerCase()) {
      warnings.push('users/' + uid + ' stored ' + maskEmail(stored) + ' but Auth is ' + maskEmail(email) + '. Login map will use Auth.');
    }
    const key = uidKey.get(uid) || (typeof data.username === 'string' ? data.username.toLowerCase() : '');
    if (key && email) queueUpsert(key, uid, email, 'users/' + uid);
    if (hasEmail) {
      if (!email && stored) {
        warnings.push('LEFT IN PLACE users/' + uid + '.email: could not resolve a usable address to copy first.');
      } else {
        strips.push({ coll: 'users', id: uid, label: 'users/' + uid + '.email' });
      }
    }
  });

  const existing = await loadLoginEmails(Array.from(upserts.keys()));
  const writes = [];
  upserts.forEach(function (row, key) {
    if (sameLogin(existing.get(key), row.uid, row.email)) return;
    writes.push({
      kind: 'set',
      ref: db.collection('loginEmails').doc(key),
      data: { uid: row.uid, email: row.email },
      label: 'loginEmails/' + key + ' ← ' + maskEmail(row.email) + ' (from ' + row.source + ')'
    });
  });
  strips.forEach(function (row) {
    writes.push({
      kind: 'strip',
      ref: db.collection(row.coll).doc(row.id),
      label: 'delete field ' + row.label
    });
  });

  console.log('Scanned usernames docs: ' + usernameDocs);
  console.log('Scanned users docs:     ' + userDocs);
  console.log('loginEmails to write:   ' + writes.filter(function (w) { return w.kind === 'set'; }).length);
  console.log('email fields to remove: ' + writes.filter(function (w) { return w.kind === 'strip'; }).length);
  console.log('');

  const shown = writes.slice(0, 80);
  shown.forEach(function (w) { console.log('  ' + w.label); });
  if (writes.length > shown.length) console.log('  … and ' + (writes.length - shown.length) + ' more');
  if (!writes.length) console.log('  (nothing to change)');

  if (warnings.length) {
    console.log('\nWarnings:');
    warnings.slice(0, 40).forEach(function (w) { console.log('  ! ' + w); });
    if (warnings.length > 40) console.log('  … and ' + (warnings.length - 40) + ' more warnings');
  }

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write these changes.');
    return;
  }

  const FieldValue = admin.firestore.FieldValue;
  let batch = db.batch();
  let n = 0;
  let committed = 0;
  for (const w of writes) {
    if (w.kind === 'set') batch.set(w.ref, w.data);
    else batch.update(w.ref, { email: FieldValue.delete() });
    n++;
    if (n === 400) {
      await batch.commit();
      committed += n;
      batch = db.batch();
      n = 0;
    }
  }
  if (n) {
    await batch.commit();
    committed += n;
  }
  console.log('\nApplied ' + committed + ' writes to ' + projectId + '.');
}

function fromAuthDiffers(stored, resolved) {
  return !!stored && !!resolved && stored.toLowerCase() !== resolved.toLowerCase();
}

main().then(function () { process.exit(0); }).catch(function (err) {
  console.error('✗ ' + (err && err.message ? err.message : err));
  process.exit(1);
});
