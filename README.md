# UniSwap (final build)

React Native (Expo, TypeScript) + Supabase. Campus rent/sell marketplace for UET Lahore.

## What is in this build
| Area | Status |
|---|---|
| Database: tables, RLS, rental state machine, search ranking, moderation, storage, notifications, cron jobs, push tokens | Done. 128 automated checks pass (`supabase/test`) |
| Sign up (university email only), email verification, login, forgot / reset password | Done |
| Home marketplace, search + filters, listing detail, request to rent / buy | Done |
| Sell / edit listing with photos, archive, delete, Pro boost | Done |
| Activity: accept / decline / cancel, handover + return with evidence photos, deposit decision, reviews | Done |
| Chat (live), unread badges, notifications (tap to open) | Done |
| Campus feed: posts with photos, likes, comments | Done |
| Report, block, blocked list | Done |
| Profile, my listings, saved, public profiles, settings, avatar, notification prefs, account deletion | Done |
| Admin: stats, reports queue (dismiss / warn / remove / suspend), user search + suspend | Done |
| Push notifications | App + server function done; needs the one-time setup in section 4 |

## 1. Supabase setup (fresh project, once)
1. **SQL Editor**: paste all of `supabase/schema.sql` and run it. It already contains every patch (002, 003, 004).
   If you set up earlier, run only the missing files from `supabase/migrations/` in order (002, 003, 004).
2. **Authentication > Users > Add user**: `seadmin@student.uet.edu.pk` with a strong password, tick *Auto Confirm User*. This account becomes admin automatically.
3. Optional: `supabase/seed_demo.sql` for demo listings.
4. **Authentication > Providers > Email**: keep *Confirm email* ON.
5. **Authentication > URL Configuration > Redirect URLs**: add `uniswap://**` (and `exp://**` for Expo Go testing).
6. **Custom SMTP (required before real students sign up)**: Supabase's built-in sender allows only a few emails per hour. Add Resend or Brevo under Authentication > Emails > SMTP Settings.

## 2. App setup
```bash
npm install
npx expo install expo-image-picker expo-image-manipulator expo-notifications expo-constants
npx tsc --noEmit        # should print nothing
npx expo start -c       # Expo Go over the same Wi-Fi or a phone hotspot
```
Pure-logic tests (Node 22+): `node --experimental-strip-types --test src/lib/*.test.ts src/features/*/*.test.ts`
Database tests need a local Postgres: `PGHOST=/tmp PGPORT=5544 PGUSER=pgtest supabase/test/run_tests.sh`

## 3. Build an installable APK
```bash
npm install -g eas-cli
eas login
eas init                       # creates the EAS project and writes its id into app.json
eas build -p android --profile preview
```
EAS prints a download link to the `.apk`. Install it on phones directly. Email-verification links and push notifications work fully in this build (not in Expo Go).

## 4. Push notifications (one time, after `eas init`)
1. `supabase functions deploy push --no-verify-jwt` (needs the Supabase CLI).
2. `supabase secrets set PUSH_WEBHOOK_SECRET=<any long random string>`
3. Dashboard > Database > Webhooks > Create: table `notifications`, event `INSERT`, type *Supabase Edge Functions* > `push`, add the HTTP header `x-webhook-secret` with the same string.
4. Install the APK, log in, allow notifications. The phone registers itself automatically.

## 5. Privacy policy URL (free, GitHub Pages)
1. Open `docs/index.html` and replace both `CONTACT_EMAIL` with your support email.
2. Create a GitHub repo (e.g. `uniswap`), push the project (the `.gitignore` already keeps `.env` out).
3. Repo > Settings > Pages > Source: *Deploy from a branch*, branch `main`, folder `/docs` > Save.
4. After a minute the policy is live at `https://<your-github-username>.github.io/<repo>/`. That is your privacy policy URL.
5. Optional: show it in the app. Add `"EXPO_PUBLIC_PRIVACY_URL": "<that url>"` to the `env` block of both profiles in `eas.json`, then rebuild.

## 6. Play Store checklist
- `eas build -p android --profile production` produces the `.aab`. Upload it in the Play Console (one-time developer fee).
- Store assets are ready in `store/`: `play-icon-512.png` (icon), `feature-graphic.png` (1024x500). Listing text is in `store/listing.md`. Take 2+ phone screenshots from the installed app.
- The privacy policy URL from section 5 is required. Account deletion exists in Settings, which Play requires.

## Before real users
- Change the admin password to something strong.
- Add the Central Library and Annexe Block zones (Table editor > `zones`).
- Test with two accounts end to end: list, request, accept, handover, return, review, chat, report.

## Notes
- The anon key in `.env` is public by design (access is enforced by RLS). Never put the `service_role` key in the app.
- UniSwap never handles money. Rent, deposit and prices are settled in person.
- Zones can be edited in the `zones` table.
