# Weekly Planner

A personal planner: daily to-do with a progress line, weekly bar and pie charts, a 5-star productivity rating, a full week board, weekly and monthly records, and a habit tracker. Days lock once they pass, so your history stays honest.

Built with plain HTML, CSS and JavaScript. Data lives in Supabase (Postgres) and the site is hosted on Vercel.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page layout and the sign-in screen |
| `style.css` | All the styling (pink theme, light and dark mode) |
| `app.js` | Screen logic: rendering, clicks, charts, records |
| `db.js` | Every call to Supabase. Only this file talks to the database |
| `config.js` | Your Supabase URL and public key |
| `supabase/schema.sql` | Database tables, security rules and the daily summary view |
| `ml/daily_summary.py` | Starter script that pulls your data into Python for ML |

## Setup (about 20 minutes, one time)

### 1. Create the database

1. Go to [supabase.com](https://supabase.com), sign in, and click **New project**. The free plan is enough.
2. Pick a name (for example `weekly-planner`), set a database password (save it somewhere), and choose the **Mumbai** region.
3. When the project is ready, open **SQL Editor > New query**, paste everything from `supabase/schema.sql`, and click **Run**. You should see "Success".
4. Open **Project Settings > API** and copy:
   - **Project URL**
   - **anon public** key
5. Paste both into `config.js`.

### 2. Turn on Google sign-in

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project, then open **APIs & Services > OAuth consent screen**. Choose **External**, fill in the app name and your email, and save.
2. Open **Credentials > Create credentials > OAuth client ID**, choose **Web application**.
3. Under **Authorized redirect URIs** add:
   `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`
   (copy the exact one from Supabase: **Authentication > Sign In / Providers > Google**).
4. Copy the **Client ID** and **Client secret** into Supabase under **Authentication > Sign In / Providers > Google**, switch it on, and save.

### 3. Put the code on GitHub

```bash
cd weekly-planner
git init
git add .
git commit -m "Weekly planner"
git branch -M main
git remote add origin https://github.com/Piyush-Thakkarr/weekly-planner.git
git push -u origin main
```

Create the empty `weekly-planner` repo on GitHub first (no README, so the push goes through).

### 4. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com), sign in with GitHub, click **Add New > Project**, and import `weekly-planner`.
2. Framework preset: **Other**. No build command. Click **Deploy**.
3. Copy your site link, for example `https://weekly-planner-xyz.vercel.app`.
4. Back in Supabase, open **Authentication > URL Configuration**:
   - **Site URL**: your Vercel link
   - **Redirect URLs**: add your Vercel link, plus `http://localhost:5500` if you test locally

Open your link, click **Continue with Google**, and you're in. On your phone, use "Add to Home screen" so it opens like an app.

Every `git push` to `main` redeploys the site automatically.

## Running it on your laptop

The page uses JavaScript modules, so open it through a small local server instead of double-clicking the file. In Windsurf, install the **Live Server** extension and click **Go Live**, or run:

```bash
npx serve -l 5500 .
```

Then open `http://localhost:5500`.

## How the data is stored

| Table | One row per |
| --- | --- |
| `tasks` | task, with its day, text, done, and when it was completed |
| `day_ratings` | rated day (1 to 5 stars) |
| `habits` | habit (removed habits are hidden, not deleted, so old ticks stay) |
| `habit_checks` | habit ticked on a day |
| `week_notes` | week's focus note |

`daily_summary` is a ready-made view with one row per day: tasks planned, tasks done, % done, rating and habits done. It's the easiest starting point for charts and ML.

### Rules the database enforces

- You only ever see and change your own rows (row level security).
- Anything dated before today (India time) can't be added, changed or deleted. The page also locks it, but the database rule is what makes it stick.
- To change the time zone, edit `planner_today()` in `schema.sql` and `TIME_ZONE` in `config.js` to match.

## Adding ML and AI later

Some starting points:

- **Analysis in Python:** `ml/daily_summary.py` loads your `daily_summary` rows into pandas. From there you can look at which weekdays you finish most, whether ratings follow completion, or train a simple model that predicts how much of tomorrow's list you'll finish.
- **AI features in the app:** add a `api/` folder with Vercel serverless functions (for example `api/suggest.js`) that call an AI model with your secret key stored in Vercel's environment variables. The page calls `/api/suggest`, so the key never reaches the browser.
- **Ideas:** suggest tomorrow's tasks from unfinished ones, a weekly summary written from your records, or a warning when your list is bigger than what you usually finish.

Keep secret keys (Supabase `service_role`, AI API keys) out of `config.js` and out of GitHub. Put them in Vercel or in a local `.env` file, which is already in `.gitignore`.
