# Honest limitations

- **Results are self-reported.** The browser measures time and moves and sends them to the database. A determined user can send made-up numbers. The database rejects impossible results (fewer moves than the room allows, implausibly fast times, unknown rooms) and Row Level Security stops anyone touching other players' data, but results are **not independently verified**. Do not use them for a competitive leaderboard, prizes or rankings.
- **Saving can fail** (network, paused free Supabase project, outdated SQL). The game then says "NOT saved", shows the technical detail, and offers **Retry saving**. It never claims success without a confirmed database response. Retrying is safe: every completed run has one id and the database stores each run id only once.
- **Free Supabase**: the built-in email service is rate-limited and the project pauses after about a week of inactivity. Quotas apply to database size and bandwidth.
- **Idle sign-out** is enforced in the browser (the free plan has no server-side inactivity timeout).
