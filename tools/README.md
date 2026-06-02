# Admin tools

## give-currency.js — grant gold / rubies to a player

Grants currency to a player's cloud save by username. **Adds** to their current
balances (it doesn't overwrite). Adding rubies raises their progress score, so
the granted save survives the game's anti-rollback guard.

### One-time setup
1. Firebase console → ⚙️ Project settings → **Service accounts** →
   **Generate new private key**. Save the file as `tools/serviceAccount.json`.
   (It's already git-ignored — never commit it.)
2. Install the SDK:
   ```bash
   cd tools
   npm install firebase-admin
   ```
   No Node locally? Run everything in **Google Cloud Shell** (free, browser-based,
   already has node + npm): upload `give-currency.js` + `serviceAccount.json`, then
   `npm install firebase-admin`.

### Run
```bash
# Defaults: Mattydaddy +10000 gold, +250 rubies
node give-currency.js

# Explicit
node give-currency.js Mattydaddy 10000 250
node give-currency.js <username> <gold> <rubies>
```

### Notes
- Have the player **reload** the game (while not mid-session) to pull the grant.
- If they keep playing offline after you run this and earn more progress, their
  client could overwrite the grant on its next save. Safest to grant while
  they're offline.
