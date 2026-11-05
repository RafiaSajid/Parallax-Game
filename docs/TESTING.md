# Testing

## Automated (no browser needed)
```
node --import ./tools/register-stub.mjs tools/test-logic.mjs   # rules + raycast/selection logic (28 tests)
node tools/solve-level.mjs                                      # proves level 1 is solvable, prints the shortest solution
```
Tests cover: right-hand-rule rotations, walls/bounds/occupied cells, plate needs marked face UP, portal closed until plate active, the plate cube cannot step into the portal, shipped solution solves the level, undo restores everything exactly, screen-to-NDC conversion, deep child-mesh hits, empty-space deselect, walls hiding cubes, drags vs clicks, paused/menu blocking, one hover raycast per frame, removed objects, listener cleanup.

## Manual browser checklist (game page)
1. Room appears; cube 1 has the selection ring + floating arrow. Panel (bottom-left) shows status.
2. Hover a cube: thin blue ring + pointer cursor. Move off: both disappear.
3. Click a different cube: selection moves. Click empty floor or a wall: deselects; WASD then does nothing.
4. Press 1/2/3 to pick cubes. WASD move the player. Shift + WASD/arrows slide one cell. Into a wall/another cube/outside: a small "bump", no move, counter unchanged.
5. Q/E roll, R/F tip. Status says "marked face UP" only when the amber face points up.
6. Select cube 3, slide it onto the plate. Plate glows and the portal opens ONLY when its amber face is up.
7. Z undoes step by step (also rotations). Moves counter follows.
8. Slide another cube into the open portal: it shrinks away, status says "Exit reached!", input locks. Restart resumes play.
9. Press P: overlay opens; clicking the canvas/cubes behind it does nothing; keys do nothing. Resume works. Restart from the pause menu returns to a fresh, UNPAUSED room (no duplicate cubes).
10. Resize the window / rotate the phone: the room refits and clicks still hit the right cube.
11. Press Restart 10 times: no slowdown, selection still works.
12. Console shows no `[puzzle] ... differs from rules` warning (that would mean a rotation-direction bug).

## Added in steps
- Resize: drag the window very short and very narrow. The whole room, both pillars and the floating shapes must stay in view.
- Win flow: finish a room. A completion card shows stars, time and moves, then "Result saved to your profile." and any new achievements. "Next room" opens room 2.
- Room 2 and 3: both plates must glow before the portal opens (objective banner shows 0/2, 1/2, 2/2).
- How to play: appears the first time; reopen with the "How to play" button. Escape closes it without opening the pause menu.
- Sounds: slide, turn, blocked, plate chime, portal whoosh, win jingle. Profile volume 0 mutes them.
- Idle sign-out: set `IDLE_MINUTES = 1` in `js/core.js`, log in, wait 90 seconds without touching anything, then reload: you land on the login page with the inactivity message. Set it back to 30.

## Step 5: completion and saving (manual)
1. Re-run `supabase/schema.sql`. Solve room 1. The card must say "Saved to your profile." with stars, time, moves and "First steps" (plus "Quick eye"/"Economy of motion"/"Flawless" if earned).
2. Verify in Supabase (SQL editor):
```
select user_id, level_id, time_ms, moves, completed_at, run_id from public.level_results order by completed_at desc limit 5;
select level_id, status, attempts, best_time_ms, best_moves, best_stars from public.player_progress;
select * from public.user_achievements;
```
3. Refresh the dashboard and log out / in: the same stars, best time and achievements appear. Room 2 is now unlocked.
4. Replay and solve room 1 again: a second `level_results` row appears, bests only improve, achievements are NOT duplicated.
5. Failure path: turn off your network (browser dev tools > Network > Offline) right when you finish. The card must say "NOT saved" with details and a Retry button. Go online and press Retry: it saves exactly once (press Retry twice: "already saved", still one row).
6. States: while paused, in the how-to card, during the portal animation and on the completion screen, clicking cubes and pressing keys does nothing. Restart from the pause menu and from the completion screen: cubes, plates, portal, selection, timer and move counter are all reset and there is no duplicate geometry.

## Step 6: dashboard, profile, settings (manual)
Re-run `supabase/schema.sql` first (adds the sound setting). Use two accounts, A and B.
1. **New account (A):** dashboard shows 0 / 3 rooms, 0 / 3 stars, "Best time: no clears yet", 0 / 4 achievements, "No runs yet", every achievement locked, only room 1 unlocked.
2. **Play and refresh:** solve room 1. Dashboard shows 1 / 3 rooms, stars, best time with the room name, the run under Recent runs, earned achievements. Log out, log in, refresh: identical.
3. **Loading and failure:** throttle the network (dev tools): each section shows "Loading…". Go offline and refresh: each section shows its own error with a Retry button (not zeros, not fake data). Go online, press Retry: it fills in.
4. **Profile:** change display name to `Zoë <b>😀</b> "Q"`. It shows as plain text everywhere (no bold, no HTML), survives refresh and re-login. 1 character, 33 characters, or an empty name are rejected with a message; nothing is saved.
5. **Settings (account):** untick Sound, set Volume, Quality low, save: "Saved to your account." Refresh and log in from a different browser: same values. In the game, the HUD says "Sound: off" and nothing plays. Click the HUD button: it only flips after the database confirms.
6. **Settings (device only):** untick "Show the controls panel". On the game screen the panel starts closed. Another browser still has it open. Opening/closing it by hand is remembered on this device.
7. **Privacy:** run `supabase/rls_tests.sql` T11-T15. Logged out, opening `dashboard.html` redirects to login; the REST API returns nothing for the anon key.
8. **Layout:** shrink the window to ~320 px wide and ~400 px tall on dashboard, profile and game. Nothing overlaps: on the game screen the HUD, the 3D view and the controls bar are separate rows; the HUD wraps and the room is re-fitted into the remaining space.

## Step 7: customize, third-person camera, models, theme (manual)
Re-run `supabase/schema.sql` first (adds camera setting, character table and `save_avatar`).
1. **Customize:** Profile > Settings > Customize. A panel opens above the page with the cylinder and a palette. Paint by dragging on the cylinder; drag the background to turn it; try the colour picker, swatches, brush size 2 and 40, Fill body, Undo stroke, Reset to smiley, top/bottom colour. Strokes continue around the back with no seam gap.
2. **Save:** press Save: "Saved to your account." Close, reopen: your painting is still there. Refresh and log in again: same. Open the game: the character on top of the selected cube wears your painting.
3. **Unsaved changes:** paint, then Close or press Escape: you are asked to discard.
4. **Failure honesty:** go offline and Save: "NOT saved" with details. Break the schema step (skip it): the panel says it could not load and disables Save.
5. **Privacy:** `supabase/rls_tests.sql` T16-T20: no direct writes to the avatar table, bad PNG/colour rejected, you only see your own row.
6. **Third-person camera:** in the game press C or use the Camera button: the camera glides behind the character; controls still move cubes the same way. Reload: the choice is remembered (saved to your account). Profile > Settings has the same option.
7. **Character:** hops to a cube when you select it, faces the direction it moves, squashes and stretches, cheers on the portal when you finish. It cannot be clicked and never blocks selecting a cube.
8. **Models:** with the two .glb files in `assets/models/`, the landing page shows the planet and login/signup show the cat; drag them anywhere, Shift+drag to spin, press Space when focused. Rename a file to simulate a missing model: the cube toy appears instead.
9. **Theme:** every page is light and colourful with readable text; shrink to 320 px and check nothing overlaps.
