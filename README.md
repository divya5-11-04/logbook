# Logbook

Log what you build. Get a recruiter-friendly LinkedIn post, an auto-updating resume, and
a "what to learn next" ranking backed by real job-posting skill frequency data — not a guess.

Stack: **Next.js (App Router)** + **Supabase** (Postgres + Auth: email/password and OAuth) + **Anthropic API**,
deployable to **Vercel** with a free-tier **Supabase** project.

---

## 1. Create your Supabase project

1. Go to https://supabase.com, create a new project.
2. In the SQL editor, paste and run the entire contents of `supabase/schema.sql`.
   This creates all tables, row-level security policies, the aggregation view, and
   seeds 12 starter categories (more can be added from the app itself).
3. Go to **Authentication > Providers** and enable:
   - **Email** (on by default)
   - **Google** and/or **GitHub** — each needs a Client ID/Secret from that provider's
     developer console, and you'll set the redirect URL to:
     `https://<your-project>.supabase.co/auth/v1/callback`
4. Go to **Authentication > URL Configuration** and add your site URL (both
   `http://localhost:3000` for local dev and your Vercel URL once deployed) to
   **Redirect URLs**.
5. Copy your **Project URL**, **anon public key**, and **service_role key** from
   **Settings > API** — you'll need these next.

## 2. Load the Kaggle dataset

1. Download `all_job_post.csv` from the Kaggle dataset and place it in the project root.
2. Create a `.env.local` file (copy `.env.example`) and fill in your Supabase URL and
   **service_role** key (this key bypasses row-level security, so it's only used
   server-side by the seed script — never commit it or expose it to the browser).
3. Install dependencies and run the seed:
   ```bash
   npm install
   npm run seed
   ```
   This inserts ~1,167 real job postings with their skill lists into `job_postings`,
   matched to the 5 categories that came with the original dataset. The other 7 seeded
   categories (Marketing, Design, Operations, Legal, Healthcare, Education, Customer
   Success) start empty — they fill in as you or your users add postings from the
   Dataset tab. That's the intended growth path: the dataset is meant to expand over
   time, not stay fixed at the Kaggle import.

## 3. Get a free Gemini API key

This project uses **Google Gemini's free tier** — no credit card, no paid plan required.

1. Go to https://aistudio.google.com/apikey and sign in with a Google account.
2. Click **Create API key**. Copy it.
3. Add it to `.env.local` as `GEMINI_API_KEY`.

This is used server-side only (in `app/api/generate` and `app/api/growth`), so it's never
exposed to the browser. The free tier (as of writing: `gemini-2.0-flash`, roughly 15
requests/minute and 1,500/day) is more than enough for personal use or a small group of
users. If you outgrow it, Groq's free tier (open-source models, very fast) is a drop-in
alternative — swap the fetch URL and request shape in `app/api/generate/route.ts` and
`app/api/growth/route.ts`.

## 4. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` — you'll land on `/login`, and can create an account from
`/signup` with email/password or Google/GitHub.

## 5. Deploy to Vercel

1. Push this project to a GitHub repo.
2. Import it in Vercel.
3. Add the same environment variables from `.env.local` to the Vercel project's
   **Settings > Environment Variables** (Supabase URL, anon key, service role
   key, and `GEMINI_API_KEY`), plus `NEXT_PUBLIC_SITE_URL` set to your Vercel URL.
4. Deploy. Update Supabase's **Redirect URLs** (step 1.4 above) to include the live
   Vercel URL once you have it.

---

## How the pieces fit together

- **Auth & accounts**: Supabase Auth handles signup/login (email or OAuth) and issues a
  session cookie that `middleware.ts` refreshes on every request and uses to gate
  `/dashboard`. A Postgres trigger (`handle_new_user` in the schema) automatically
  creates a `profiles` row the moment someone signs up, using the name/target role/voice
  they entered on the signup form.

- **Row-level security**: `entries` are private per user — Postgres itself enforces that
  a user can only ever see their own rows, not just the app code. `job_postings` are
  shared and readable by any signed-in user, since the dataset is meant to be collective.

- **The generation loop**: the browser never talks to Gemini directly. `/api/generate`
  runs server-side, reads your profile's voice/target role from Postgres, and returns
  the structured post + resume bullet — keeping your API key off the client entirely.

- **The growth engine**: `/api/growth` classifies your target role against the actual
  category list in your database (not a hardcoded set of 5), pulls real skill-frequency
  counts from the `category_skill_counts` view, and ranks what you're missing — Gemini
  only explains the ranking and suggests one next step, it doesn't invent or reorder it.

- **Growing the dataset**: the Dataset tab lets any signed-in user add a job posting —
  title, skills, and either an existing or brand-new category. New categories are created
  on the fly (see `/api/postings`), which is how you go beyond the 5 categories the
  Kaggle CSV originally covered.

## What's genuinely still missing

- **Live real-time job-board scraping** is not implemented — that requires calling
  external job-board APIs on a schedule (a cron job or serverless function hitting
  something like Adzuna or Remotive), which is a reasonable next addition but a separate
  piece of infrastructure from what's here.
- **Rate limiting / cost control**: Gemini's free tier has its own request caps (roughly
  15/min, 1,500/day at time of writing) — for a public multi-user deployment, add
  per-user request limits so one heavy user doesn't exhaust the shared quota for everyone.
- **Email confirmation** is on by default in Supabase — you can turn it off in
  Authentication settings for faster testing, but keep it on in production.
