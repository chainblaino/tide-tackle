# Tide & Tackle: App Store checklist

The game code is ready for ads and ruby purchases. What's left is accounts,
App Store setup, and wrapping the game as an iPhone app on the Mac. Work top to
bottom.

## Already done in the game

- **Retry after a lost fight.** Legendaries, tournament fish, surf and ice fish
  offer one retry: watch an ad, or pay 5 rubies. Ultra legendaries stay free.
  Short on rubies, the pay button opens the ruby store.
- **Ruby store.** Tap the ruby counter, or Shop → Special → Get Rubies.

  | Product id | Rubies | Price |
  |---|---|---|
  | `rubies_100` | 100 | $0.99 |
  | `rubies_550` | 550 | $4.99 |
  | `rubies_1200` | 1,200 | $9.99 |
  | `rubies_2600` | 2,600 | $19.99 |
  | `rubies_7000` | 7,000 | $49.99 |

- **Website vs app.** On the website the ad button is hidden and the store says
  to get the app. Purchases only happen inside the app, through Apple, as Apple
  requires.
- **Local test mode.** On `localhost` / `127.0.0.1` the ad and purchases are
  simulated, so you can play the whole flow without paying.
- **Account deletion** is already in Settings (Apple requires it).

## 1. Accounts to create

- [ ] **Apple Developer Program**: $99/year, enroll as an Individual.
  developer.apple.com, or use the Apple Developer app on an iPhone. Your Apple
  Account needs two-factor authentication turned on. Approval usually takes a
  day or two.
- [ ] **AdMob** (Google's ad network): free. admob.google.com
  - Add an **iOS** app and create one **Rewarded** ad unit for it.
- [ ] **RevenueCat** (checks Apple purchases and keeps the records): free until
  $2,500/month in revenue. revenuecat.com

## 2. Set up the Mac

- [ ] Check the Mac can run a recent macOS (Apple menu → About This Mac).
  Current Xcode needs one, and Apple only accepts uploads built with a current
  Xcode.
- [ ] Install **Xcode** from the Mac App Store and open it once to finish setup.
- [ ] Install **Node.js**, the LTS version from nodejs.org.
- [ ] Install Claude Code on the Mac and download the game:
  `git clone https://github.com/chainblaino/tide-tackle.git`

## 3. App Store Connect

Once your developer account is approved:

- [ ] Create the app record: name, bundle id (e.g. `com.yourname.tidetackle`)
  and primary language.
- [ ] Create the five products above as **Consumable** in-app purchases, with
  the exact product ids.
- [ ] Sign the **Paid Apps agreement** and fill in your banking and tax info.
  In-app purchases won't work, even in testing, until this is done.
- [ ] In **RevenueCat**, add the iOS app, connect it to App Store Connect, and
  add the five products.

## 4. Fill in the game's config

In `index.html`, search for `TT_CONFIG` and replace:

- [ ] `admobRewarded.ios`: your real AdMob rewarded unit id. It starts as
  Google's test id, which shows test ads and pays nothing.
- [ ] `admobTesting`: set to `false` for the release build.
- [ ] `revenueCatKey.ios`: your RevenueCat public iOS key. It starts `appl_`.

## 5. Wrap the game as an iPhone app (Capacitor)

I'll do this with you in a session on the Mac:

- Capacitor project with the game copied into `www/`.
- Plugins: `@capacitor-community/admob` and `@revenuecat/purchases-capacitor`.
- **`Info.plist`:**
  - `GADApplicationIdentifier`: your AdMob **app** id. This is not the ad unit id.
  - `NSUserTrackingUsageDescription`: e.g. "Used to show you more relevant ads."
  - AdMob's `SKAdNetworkItems` list.
- **App icon and launch screen.**
- **Testing:**
  - Run the app in Xcode's simulator, then on your own iPhone.
  - Test purchases with a **Sandbox** tester account, which you create in App
    Store Connect.
  - Upload a build to **TestFlight** before you submit it.

## 6. Store listing

- [ ] **Privacy policy URL.** It must cover:
  - Firebase accounts: username and email
  - saved game progress
  - AdMob advertising data
  - purchases
- [ ] **App Privacy form** in App Store Connect. Declare the same data:
  identifiers and usage data for ads, purchase history, email.
- [ ] **Age rating questionnaire.** Answer yes to in-app purchases. There's no
  gambling and nothing random is sold for real money.
- [ ] **Screenshots:**
  - iPhone 6.9" and 6.5"
  - iPad, if you support iPad. You can make the app iPhone-only to skip this.
- [ ] **Description, keywords, support URL and contact email.**
- [ ] **A test account for Apple's reviewer**, with its login in the review notes.
  Mention that ads and purchases are in the retry screen and the ruby store.

## Things to know

- **Rubies live in the player's save.** A guest's rubies stay on that device
  only, and the store tells guests to sign in to keep them. A determined cheater
  could still edit their save. The fix is to have RevenueCat notify a Firebase
  Cloud Function that adds the rubies on the server. That needs Firebase's
  pay-as-you-go plan. It's worth doing later, but launch doesn't need it.
- **Ads in a tournament.** Watching an ad mid-tournament uses up match time.
  That's the player's choice to make.
- **Google Play later.** The game code already supports Android, so adding it
  later is store setup and an Android build, not a rewrite.
