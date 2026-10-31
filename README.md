# PARALLAX: The Shape of Space

## How the game works (the rules)
1. Every cube has ONE amber face. Turn a cube until that face points **UP**.
2. Slide that cube onto a **pressure plate**. The plate glows when a cube rests on it with the amber face up.
3. When **every** plate in the room glows, the **portal opens**.
4. Slide **one spare cube** into the portal. That completes the room. You do **not** need to move every cube into it.
5. Stars: 1 for finishing, +1 for finishing within the move par, +1 for finishing within the time par. The timer starts at your first move.
There are 3 rooms. Finish a room to unlock the next.

## Game states
MENU (how-to card) -> PLAYING <-> PAUSED. PLAYING -> SOLVED (portal animation, input locked) -> COMPLETE (completion screen, result saved). Restart from any state except the menu returns to PLAYING with a fully reset room. Cubes can only be touched in PLAYING (`js/game/GameFlow.js`).

## Saving results
After COMPLETE the game calls the database function `submit_level_result` once per run (one run id, so retries cannot duplicate). The screen says "Saved to your profile." only after the database confirms it. If it fails it says "NOT saved", shows the error detail and offers Retry. See `docs/LIMITATIONS.md` for what these results do and do not prove.

## Your character
Profile > Settings > Customize opens a painter: paint a cylinder (any colour, adjustable brush), pick its top/bottom colour and save it to your account. In the game the cylinder rides the cube you select. Press C (or the Camera button) for the third-person follow camera. The painting is a small PNG stored in the `player_avatar` table; only you can read it and it can only be written through the validated `save_avatar` function.

## Where settings live
Account settings (sound on/off, volume, graphics quality, reduce motion, invert camera) are stored in the database per user (`player_settings`, protected by Row Level Security) and follow you to any device. "Show controls panel" is a device-only preference kept in this browser's localStorage. Display name is edited on the Profile page.

## Controls
Click/tap a cube to select it (click empty space to deselect) · 1-3 pick a cube · WASD/arrows slide · Q/E roll · R/F tip · Z undo · P or Esc pause.

## Sessions
You are signed out automatically after 30 minutes without any key press, click or touch (change `IDLE_MINUTES` in `js/core.js`). Supabase's free plan has no server-side inactivity timeout, so this is enforced by the app in the browser.

## Start here
See `docs/CHECKLIST.md` (first-time setup) and `docs/SETUP.md`. Tests: `docs/TESTING.md`.

## Updating from an earlier zip (IMPORTANT)
1. In Supabase SQL Editor, open a new query, paste the **whole current `supabase/schema.sql`** and Run it (safe to re-run; it adds stars, rooms 2-3, run ids and a fixed save function). There is no separate level2 file. Being logged in to the Supabase dashboard is the normal state when you do this.
2. Extract the zip over your project folder and choose "Replace". Your `js/config.js` is not in the zip, so your keys are kept.
3. Hard-refresh the browser (Ctrl+Shift+R).
