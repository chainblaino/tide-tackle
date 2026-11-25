#!/usr/bin/env node
/*
 * Tide & Tackle — remove player emails from public Firestore docs.
 *
 * Background: users/{uid}.email and usernames/{username}.email were readable
 * by every signed-in player. The game no longer writes them: the email lives
 * only in Firebase Auth, and username login looks it up on the server
 * (functions/index.js: usernameLogin). Nothing reads the old Firestore copies
 * any more, so this script just deletes the `email` field from both
 * collections. It does not change Auth users, passwords, saves, friends, or
 * leaderboard docs.
 *
 * DO NOT RUN until the usernameLogin function and firestore.rules from the same
 * change are deployed and the updated index.html is what players load (order:
 * functions/README.md). Dry-run is the default and writes nothing.
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

async function main() {
  const projectId = serviceAccount.project_id || '(unknown project)';
  console.log(APPLY ? 'APPLY — writing to ' + projectId : 'DRY RUN — no writes. Project: ' + projectId);
  console.log('Auth users are not modified. Pass --apply to write.\n');

  const strips = []; // {ref, label}
  const counts = { usernames: 0, users: 0 };

  for (const coll of ['usernames', 'users']) {
    await eachDoc(coll, async function (doc) {
      counts[coll]++;
      const data = doc.data() || {};
      if (!Object.prototype.hasOwnProperty.call(data, 'email')) return;
      strips.push({ ref: doc.ref, label: coll + '/' + doc.id + '.email (' + maskEmail(data.email) + ')' });
    });
  }

  console.log('Scanned usernames docs: ' + counts.usernames);
  console.log('Scanned users docs:     ' + counts.users);
  console.log('email fields to remove: ' + strips.length + '\n');

  strips.slice(0, 80).forEach(function (s) { console.log('  delete field ' + s.label); });
  if (strips.length > 80) console.log('  … and ' + (strips.length - 80) + ' more');
  if (!strips.length) console.log('  (nothing to change)');

  if (!APPLY) {
    console.log('\nDry run only. Re-run with --apply to write these changes.');
    return;
  }

  const FieldValue = admin.firestore.FieldValue;
  let batch = db.batch();
  let n = 0;
  let committed = 0;
  for (const s of strips) {
    batch.update(s.ref, { email: FieldValue.delete() });
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
  console.log('\nRemoved ' + committed + ' email fields in ' + projectId + '.');
}

main().then(function () { process.exit(0); }).catch(function (err) {
  console.error('✗ ' + (err && err.message ? err.message : err));
  process.exit(1);
});
