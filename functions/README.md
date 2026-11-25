# Cloud Functions

## usernameLogin — log in with a username without exposing emails

Players can log in with their username. The game sends the username and
password to this function. It finds the account's email in Firebase Auth,
checks the password, and returns a one-time sign-in token. No client ever reads
another player's email. After 8 wrong tries on one username, that username is
locked for 15 minutes.

### One-time setup

1. **Blaze plan.** Firebase console → ⚙️ → Usage and billing → upgrade to
   **Blaze (pay as you go)**. Cloud Functions need it. Login calls at this
   game's size fit well inside the free monthly allowance. Set a budget alert
   (e.g. $5) there so you'd hear about any surprise.
2. **Firebase CLI** (needs Node.js):
   ```bash
   npm install -g firebase-tools
   firebase login
   ```
3. **Let the function create sign-in tokens.** Google Cloud console
   (console.cloud.google.com) → project **tide-and-tackle** → IAM & Admin →
   IAM. Find the **Default compute service account**
   (`208248255812-compute@developer.gserviceaccount.com`), click the pencil, and
   add the role **Service Account Token Creator**. Without it, every username
   login fails with "Username login is unavailable".
4. If you ever restricted the web API key (Google Cloud console → APIs &
   Services → Credentials) to certain websites, the function's server calls get
   blocked. Leave it unrestricted by website, or allow the Identity Toolkit API
   without a website restriction.

### Deploy order (the live site has to match the rules)

Run these from the repo folder, in this order, close together:

1. `cd functions && npm install && cd ..`
2. `firebase deploy --only functions` — username login is now live on the
   server. The current site doesn't use it yet, so nothing changes for players.
3. `firebase deploy --only firestore:rules` — from here, the old site's
   sign-up is refused (it tries to save the email publicly). Do step 4 right
   away.
4. Push the matching `index.html` to GitHub (`git push`). GitHub Pages updates
   within a minute or two.
5. Run the cleanup: `tools/strip-public-emails.js`, first as a dry run, then
   with `--apply` (see `tools/README.md`).

### Checking it

- Log in with a username: it should work.
- Log in with a wrong password: "Incorrect login or password."
- Log in with an email: it should work exactly as before.
- Logs: Firebase console → Functions → usernameLogin → Logs.
