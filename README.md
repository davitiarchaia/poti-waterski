# Poti Lake Club: booking site

Booking site for Poti Lake Club (waterski and wakeboard at Golden Lake, Maltakva, Poti, Georgia).
Live: https://ratimelia-blip.github.io/poti-waterski/ (the planned domain is plcbook.ge). 

## How it is built

| Part | Where | Notes |
|---|---|---|
| Website | This repo, served by **GitHub Pages** from `main` | Plain HTML/CSS/JS with no build step. Every push to `main` goes live in about a minute. |
| Database, sign-in, files | **Supabase** project `boijrdntbfxvopcamdsd` | Postgres with row-level security, triggers and RPC functions. Auth: email, Google, Facebook. Storage buckets: `lake-photos` (public), `staff-files` (private). |
| Server functions | `supabase/functions/*` (deployed to the same Supabase project) | `notify` sends emails through Gmail. `bog-pay`, `bog-callback` and `bog-capture` handle Bank of Georgia online payments. `review-reminder` runs on a schedule. |

### Pages
- `index.html`: home page and the booking wizard (`app.js`, `wizard.js`)
- `owner.html`: owner dashboard (`owner*.js`). Open it with an account whose `profiles.role = 'owner'`.
- `staff.html`: coach and driver view
- `events.html`, `riders.html`: events and the public rider list
- `terms.html`: terms and privacy
- `config.js`: club settings (phone, hours, cancellation rules, payment switches)
- `i18n.js`, `community-i18n.js`: texts in Georgian, English and Russian

### Making a change
1. Edit the files and test locally. Any static server works, for example `python3 -m http.server`, or run `start-server.bat` on Windows.
2. Bump the `?v=YYYYMMDDx` cache version on the `<script>` and `<link>` tags in the HTML files so browsers load the new files.
3. Commit and push to `main`.

## Secrets (Supabase → Edge Functions → Secrets)
| Name | Used by | Purpose |
|---|---|---|
| `GMAIL_USER`, `GMAIL_APP_PASSWORD` | notify | Sending emails (a Gmail app password, not the normal password) |
| `OWNER_EMAIL` (optional) | notify | Extra addresses for new-booking emails |
| `SITE_URL` | notify | Site address used for links in emails |
| `BOG_CLIENT_ID`, `BOG_CLIENT_SECRET` | bog-* | Bank of Georgia online payments. After adding them, set `onlinePayment: true` in `config.js`. |

The Google and Facebook sign-in secrets are stored in Supabase → Authentication → Providers.

## Backing up the database structure
The database schema lives in Supabase. To get a full, exact copy as SQL, use the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started):

```bash
supabase login
supabase link --project-ref boijrdntbfxvopcamdsd
supabase db dump -f supabase/schema.sql            # tables, functions, triggers, policies, grants
supabase db dump --data-only -f backup-data.sql    # data (keep it private, never commit it)
```

The migration history is in Supabase → Database → Migrations.

Note: the table `public.iq_attempts` belongs to a separate IQ-test project that shares this Supabase project. The booking site does not use it.

## After a domain or address change
Update these places:
1. Supabase → Authentication → URL Configuration: **Site URL** and **Redirect URLs**
2. The `SITE_URL` secret (see above)
3. `canonical` and `og:` tags in the HTML files, `sitemap.xml`, `robots.txt`
4. Google Cloud → OAuth client → **Authorized JavaScript origins**, and Facebook app → **App domains / Site URL** (the redirect URI stays the Supabase callback: `https://boijrdntbfxvopcamdsd.supabase.co/auth/v1/callback`)
