"""
Pull your planner history into pandas for analysis and ML.

Setup:
    pip install supabase pandas python-dotenv

Create a file called .env next to this script (it is ignored by git):
    SUPABASE_URL=https://YOUR-PROJECT-ID.supabase.co
    SUPABASE_SERVICE_KEY=your service_role key   (Project Settings > API)
    PLANNER_USER_ID=your user id                 (Authentication > Users)

The service_role key skips the privacy rules, so keep it on your own
machine only. Never put it in config.js or on GitHub.

Run:
    python ml/daily_summary.py
"""

import os

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
user_id = os.environ["PLANNER_USER_ID"]

rows = (
    client.table("daily_summary")
    .select("*")
    .eq("user_id", user_id)
    .order("day")
    .execute()
    .data
)

df = pd.DataFrame(rows)
if df.empty:
    print("No data yet. Use the planner for a few days first.")
    raise SystemExit

df["day"] = pd.to_datetime(df["day"])
df["weekday"] = df["day"].dt.day_name()

print(f"{len(df)} days recorded\n")
print("Average % done by weekday:")
print(df.groupby("weekday")["pct_done"].mean().round(1).sort_values(ascending=False), "\n")

rated = df.dropna(subset=["rating", "pct_done"])
if len(rated) >= 5:
    print("Link between % done and your star rating (1 = always together):")
    print(round(rated["pct_done"].corr(rated["rating"]), 2))

df.to_csv("ml/daily_summary.csv", index=False)
print("\nSaved ml/daily_summary.csv")
