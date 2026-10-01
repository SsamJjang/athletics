# GCS Athletics

The athletics website for **Gaonnuri Christian School**: an interactive calendar of games, tryouts and sign-up deadlines; every sport by season (plus smaller "opportunity" sports like indoor rowing); notices; and athlete spotlights. The Student Council ADs run it from inside the site.

Vite + React + TypeScript + Tailwind v4, Supabase for auth and data, hosted on **Cloudflare Pages**.

---

## Who can do what

| Account | How they sign in | What they see |
|---|---|---|
| Logged-out visitor | — | Only the sign-in page. Nothing else loads, and the database refuses reads without a session. |
| **Student / staff** | Google, `@gcssongdo.co.kr` only | Everything, plus sign-ups, following teams, and issuing family codes |
| **Parent (unverified)** | A code emailed to any address (no Google — see below) | Same as a visitor, plus the "enter family code" screen |
| **Parent (verified)** | Same | Everything a student sees, plus their child's sign-ups |
| **Admin** | Either door; email listed in `supabase/admins.sql` | Create and edit everything, see sign-up lists, verify or revoke parents |

### ✏️ Choosing admins

Open **`supabase/admins.sql`**, edit the list of emails, then paste the whole file into Supabase → SQL Editor → Run. It takes effect on the next click, with no redeploy. Every permission check in the database reads this list.

### How parents prove they're real

There's no roster, so a parent's link to the school goes through their child:

1. The student signs in with their school Google account. That proves they're a GCS student.
2. On **My page → Family** they press **New code** and get something like `K7QM-3XPA`.
3. The parent signs in (Parent tab) and enters the code. Their account is now linked to that student and verified.

Codes are single-use, expire after 7 days, and a student can have at most 3 live at once. Wrong guesses are capped at 8 per hour per account (there are about 850 billion possible codes). Students see every linked parent on their page and can remove one. Admins see all links under **Admin → People & families**.

If a family can't get a code, an admin can press **Verify** on the parent's account after confirming who they are some other way (for example, through the office).

The limit to be honest about: a student could issue a code to a second account of their own. That only gets them what they already have, and it shows up as a "parent" with their name on it in the admin list.

---

## Setup

### 1. Supabase

1. Create a project (or reuse one).
2. SQL Editor → run, in order:
   - `supabase/schema.sql`: tables, the sign-up gate, parent verification, row-level security, and the image bucket. Safe to re-run.
   - `supabase/admins.sql`: **edit the emails first**.
   - `supabase/seed.sql` (once): starter sports. Edit or delete them on the site.
3. **Authentication → Providers**
   - **Google**: on. Use the same Google Cloud OAuth client as Key Club, or a new one.
   - **Email**: on, with **Confirm email** on. (This powers the parent sign-in codes.)
4. **Authentication → Email Templates → Magic Link**. Supabase's default template sends a *link*; the site asks parents for a *code*. Replace the body with something like:

   ```html
   <h2>Your GCS Athletics sign-in code</h2>
   <p style="font-size:28px;font-weight:700;letter-spacing:4px">{{ .Token }}</p>
   <p>It expires in an hour. If you didn't ask for this, ignore this email.</p>
   ```

5. **Authentication → SMTP**. Supabase's built-in email only sends a few messages an hour, which is not enough for a school's worth of parents. Plug in any SMTP provider (Resend, Brevo, SendGrid…).
6. **Authentication → URL Configuration**
   - Site URL: your Pages URL, e.g. `https://gcs-athletics.pages.dev`
   - Redirect URLs: add `https://gcs-athletics.pages.dev/**`, plus `http://localhost:5173/**` for development.

### 2. Google Cloud (OAuth client)

- Reuses Key Club's OAuth client, which is **Internal** (only `@gcssongdo.co.kr` accounts). That's why parents sign in with emailed codes instead of Google, and why the SMTP setup above is required.
- Add this project's callback URL to that client's authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`.
- The school wifi blocks the Google Cloud Console, so do this step from home or a hotspot.

### 3. Cloudflare Pages

Connect the GitHub repo, then set:

| Setting | Value |
|---|---|
| Framework preset | None (or Vite) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `NODE_VERSION` = `22` |

`public/_redirects` sends deep links (`/calendar`, `/sports/indoor-rowing`) to the app, so shared links work.

### 4. Local development

```bash
cp .env.example .env    # fill in the two values
npm install
npm run dev
```

---

## For the ADs: running the site

Everything is edited on the site itself. Look for **+ Event / + Notice / + Sport / + Athlete** buttons and **Edit** buttons, or use the **Admin** tab.

- **Events** come in these types: game, tournament, tryout, sign-up deadline, practice, meeting. Practices can repeat weekly, and each week can still be edited or cancelled on its own.
- **Sign-ups**: tick "Students sign up for this", and optionally set when sign-ups close and how many spots there are. Open the event on the calendar to see the list, and click **Export CSV** for a spreadsheet.
- **Results**: after a game, edit it and fill in the score and win/loss/draw. It then appears in the home page ticker and the sport's season record.
- **Members only** hides an event or notice from logged-out visitors.
- **Athlete spotlights** are only visible to students, staff and verified parents. Get the student's OK before posting.
- Text fields support simple formatting: use the **B / I / H / •** buttons and **Preview**. Photos are resized automatically, and location data is stripped from them.

## Project map

```
supabase/
  schema.sql      tables, sign-up gate, parent codes, RLS, storage
  admins.sql      ✏️ the admin email list
  seed.sql        starter sports
src/
  pages/          Home, Calendar, Sports, SportDetail, Notices, Athletes,
                  Login, Family (parents), Me (students), Admin
  components/     Layout, EventDrawer, ui kit, admin/ forms
  context/        AuthContext (sessions, access flags), DataContext (sports, follows)
  lib/            dates, events, ics export, markdown, uploads
```
