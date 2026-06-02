#!/usr/bin/env node
/*
 * Tide & Tackle — admin: grant gold / rubies to a player by username.
 *
 * Usage:
 *   node give-currency.js                       -> Mattydaddy +10000 gold, +250 rubies (defaults)
 *   node give-currency.js <username> <gold> <rubies>
 *   node give-currency.js Mattydaddy 10000 250
 *
 * Requires a Firebase service-account key saved next to this file as
 * serviceAccount.json (download from Firebase console -> Project settings ->
 * Service accounts -> Generate new private key). NEVER commit that file.
 *
 * Setup (local):  npm install firebase-admin
 * Or run it in Google Cloud Shell, which already has node + npm.
 */
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./serviceAccount.json')) });
const db = admin.firestore();

// Mirror of the in-game progressScore() so the cloud save's score stays
// consistent and the anti-rollback guard keeps the granted save.
function progressScore(s) {
  return (s.totalCatches || 0) * 4
    + Math.floor((s.goldEarned || 0) / 50)
    + (s.level || 1) * 8
    + Object.keys(s.caught || {}).length * 6
    + (s.rubies || 0) * 2
    + (s.totalCasts || 0)
    + (s.tournamentWins || 0) * 5;
}

async function giveCurrency(username, gold, rubies) {
  const uname = String(username).toLowerCase();
  const u = await db.collection('usernames').doc(uname).get();
  if (!u.exists) throw new Error('No account with username "' + username + '"');
  const uid = u.data().uid;

  const ref = db.collection('saves').doc(uid);
  const snap = await ref.get();
  if (!snap.exists || !snap.data().data) throw new Error('No cloud save for ' + username + ' yet (they must play once while signed in).');

  const S = JSON.parse(snap.data().data);
  const beforeGold = S.gold || 0, beforeRubies = S.rubies || 0;
  S.gold = beforeGold + gold;
  S.rubies = beforeRubies + rubies;

  await ref.set({ data: JSON.stringify(S), score: progressScore(S) }, { merge: true });
  console.log('✓ ' + username + ' (uid ' + uid + ')');
  console.log('  gold:   ' + beforeGold + ' -> ' + S.gold + '  (+' + gold + ')');
  console.log('  rubies: ' + beforeRubies + ' -> ' + S.rubies + '  (+' + rubies + ')');
  console.log('  Have them RELOAD the game (while not mid-session) to pull the grant.');
}

const [username = 'Mattydaddy', gold = '10000', rubies = '250'] = process.argv.slice(2);
giveCurrency(username, Number(gold), Number(rubies))
  .then(() => process.exit(0))
  .catch(err => { console.error('✗ ' + err.message); process.exit(1); });
