# Tide & Tackle: App Store and Google Play checklist

The game code is ready for ads and ruby purchases. What's left is accounts,
store setup, and wrapping the game as a native app. Work top to bottom.

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
  to get the app. Purchases only happen inside the app, through Apple or Google,
  as both stores require.
- **Local test mode.** On `localhost` / `127.0.0.1` the ad and purchases are
  simulated, so you can play the whole flow without paying.
- **Account deletion** is already in Settings (Apple requires it).

## 1. Accounts to create

- [ ] **Apple Developer Program**: $99/year. developer.apple.com
- [ ] **Google Play Console**: $25 once. play.google.com/console
- [ ] **AdMob** (Google's ad network): free. admob.google.com
  - Add an iOS app and an Android app, and create one **Rewarded** ad unit for each.
- [ ] **RevenueCat** (handles Apple and Google purchases for you): free until
  $2,500/month in revenue. revenuecat.com
- [ ] **Codemagic** (builds the iPhone app in the cloud, since there's no Mac):
  free tier. codemagic.io

## 2. Store products

- [ ] In **App Store Connect**, create the five products above as
  **Consumable** in-app purchases, with the exact product ids.
- [ ] In **Google Play Console**, create the same five as **one-time products**.
- [ ] In **RevenueCat**, connect both stores and add the five products.

## 3. Fill in the game's config

In `index.html`, search for `TT_CONFIG` and replace:

- [ ] `admobRewarded.ios` / `.android`: your real AdMob rewarded unit ids. They
  start as Google's test ids, which show test ads and pay nothing.
- [ ] `admobTesting`: set to `false` for the release build.
- [ ] `revenueCatKey.ios` / `.android`: your RevenueCat public API keys. The
  iOS key starts `appl_` and the Android key starts `goog_`.

## 4. Wrap the game as an app (Capacitor)

This needs Node.js, which isn't installed on this PC yet. I can set up the
project folder and the Codemagic build file for you.

- Capacitor project with the game copied into `www/`.
- Plugins: `@capacitor-community/admob` and `@revenuecat/purchases-capacitor`.
- **iOS `Info.plist`:**
  - `GADApplicationIdentifier`: your AdMob **app** id. This is not the ad unit id.
  - `NSUserTrackingUsageDescription`: e.g. "Used to show you more relevant ads."
  - AdMob's `SKAdNetworkItems` list.
- **Android `AndroidManifest.xml`:** the AdMob app id as
  `com.google.android.gms.ads.APPLICATION_ID`.
- The Android build can be made on this PC with Android Studio. The iPhone build
  is made on Codemagic.

## 5. Store listing requirements

- [ ] **Privacy policy URL.** Required by both stores. It must cover:
  - Firebase accounts: username and email
  - saved game progress
  - AdMob advertising data
  - purchases
- [ ] **App Privacy form** (Apple) and **Data safety form** (Google). Declare the
  same data: identifiers and usage data for ads, purchase history, email.
- [ ] **Age rating questionnaires.** Answer yes to in-app purchases. There's no
  gambling and nothing random is sold for real money.
- [ ] **Screenshots:**
  - iPhone 6.9" and 6.5"
  - iPad, if you support iPad
  - Android phone
- [ ] **Support URL and contact email.**
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
