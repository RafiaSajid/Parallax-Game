// Explicit game states. This is the single source of truth for "may the player touch the world right now?".
// Selection state (Interaction) and puzzle state (PuzzleState) are separate; this only says what phase the game is in.
export const S = Object.freeze({ MENU: 'menu', PLAYING: 'playing', PAUSED: 'paused', SOLVED: 'solved', COMPLETE: 'complete' });

const ALLOWED = {
  [S.MENU]: [S.PLAYING],                         // start, or close the how-to card
  [S.PLAYING]: [S.PAUSED, S.SOLVED, S.MENU],     // pause, win, or open the how-to card
  [S.PAUSED]: [S.PLAYING],                       // resume
  [S.SOLVED]: [S.COMPLETE],                      // portal animation finished
  [S.COMPLETE]: [],                              // only restart leaves this state
};

export class GameFlow {
  constructor(initial = S.MENU) { this.state = initial; this.listeners = new Set(); }
  get canManipulate() { return this.state === S.PLAYING; }
  get frozen() { return this.state === S.PAUSED || this.state === S.MENU; } // clock and animations stop

  // listener(state, previousState, event) where event is 'restart' for restarts, else undefined
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(state, prev, event) { this.listeners.forEach((fn) => fn(state, prev, event)); }

  go(next) {
    if (next === this.state || !ALLOWED[this.state].includes(next)) return false; // illegal transitions are ignored, never thrown
    const prev = this.state; this.state = next; this._emit(next, prev); return true;
  }
  start() { return this.go(S.PLAYING); }
  openMenu() { return this.go(S.MENU); }
  pause() { return this.go(S.PAUSED); }
  resume() { return this.state === S.PAUSED ? this.go(S.PLAYING) : false; }
  solve() { return this.go(S.SOLVED); }
  finish() { return this.go(S.COMPLETE); }
  // Restart is allowed from every state except the menu card, and always lands in PLAYING.
  restart() {
    if (this.state === S.MENU) return false;
    const prev = this.state; this.state = S.PLAYING; this._emit(S.PLAYING, prev, 'restart'); return true;
  }
}
