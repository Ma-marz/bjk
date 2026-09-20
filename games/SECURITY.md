# Game session integrity

`security.js` loads before the portal and all three game scripts. It does not
inspect DevTools, window sizes, or debugger timing. Opening DevTools alone does
not block anything.

Each game registers once while its script loads and keeps the returned capability
in its module closure. `guard.wrap` / `guard.run` authorize **synchronous** updates:
checks run before the callback, then its own DOM mutation records are consumed and
its private-state snapshots updated. Timer callbacks, animation frames, event
handlers, and asynchronous continuations use these boundaries. Never wrap an
entire asynchronous operation and assume its work after `await` is authorized.

Protection covers:

- **Mario:** private score, speed progression, jump/floor/obstacle state and game
  functions; character/obstacle/floor DOM, score text, game attributes, authored
  collision CSS and computed character/obstacle geometry.
- **Memory:** private timer origin, elapsed time, attempts, 16-card deck, pairs,
  matched/completion state, first selection, locks, board version and scoring
  functions; board/card/image attributes, flip classes and timer/attempt text;
  authored card CSS. Failed image loading still retries without starting a short
  board. Deleting a card from a complete board is tampering.
- **Flappy:** frozen constants and protected physics prototype; a read-only Proxy
  view of flight state and nested gates, with only engine methods receiving the
  writable model; snapshots of velocity, position, score, collision/alive state,
  gate positions/settings, accumulator, frame timing and submission state;
  canvas/stage attributes and score DOM.

MutationObserver checks catch outside DOM changes, including changes restored in
the same task. CSSOM and private-state checks run before guarded callbacks and
on a 100 ms heartbeat. Computed-style monitors run only while the game is
rendered, retaining their last visible baseline while hidden. Browsers report
`transform: none` for hidden Memory faces; navigation must not turn that normal
layout change into a tamper signal. Private state, DOM and authored stylesheet
checks remain active when a game is hidden. Core clocks, scheduling functions and arithmetic helpers
are also checked for replacement. No elapsed-time-gap heuristic is used, so a
background tab or debugger pause alone is not treated as cheating.

The shared compromised flag lives in a closure and has no reset method. Detection
cancels game timers/animation and rejects gameplay callbacks. Navigation stays
available: the Estonian message appears inside the selected game and is hidden
on other pages and the games list. Restarting, switching games or logging out
cannot reset it. A full document reload creates a new session. No backend ban or
cheater flag is written.

Score submission uses one-use in-memory permits: games submit through their private
capability, and the private portal queue authorizes actual API requests. Direct
calls to the public saver or a forged Mario score event cannot submit a result.
Checks precede queue writes, API calls and result application, and run again after
asynchronous responses. On compromise, pending score requests are aborted and
unsent results created by this page are removed from the queue. Previously queued
honest results are preserved. The score queue checks outside storage edits while
allowing real storage events from other tabs. Game backend validation is unchanged.

## Manual checks

Open the relevant game first. Run **one** attack, verify the blocked message and
no `saveScore` request in Network, then reload before the next test.

```js
// Mario: bypassing collision by moving the character.
document.querySelector('#character').style.bottom = '150px';

// Memory: fake a completion class, or change #memoryTime in Inspect Element.
document.querySelector('.memory-card').classList.add('matched');

// Flappy: replace physics/collision. A TypeError is also expected in strict mode.
BJKFlappyEngine.Flight.prototype.step = function () {};

// Try to forge a score without completing a game.
await saveScoreWithFallback('bjker-mario', 999999);
```

After blocking, inspect `BJKGameSecurity.blocked` and `BJKGameSecurity.reason`.
Try another game, restart, and `BJKGameSecurity.blocked = false`; all games stay
blocked. Reload and play normally. Touch, Space, resize, scrolling, card flips,
image-load retries and normal score submissions should continue to work.

Automated browser checks: serve the repo locally on port 8000, then run
`node tests/game-security.test.cjs`, `node tests/flappy-browser.test.cjs`, and
`node tests/game-reliability.test.cjs`. Navigation/hidden-layout regressions run
with `node tests/game-security-navigation.test.cjs`. API calls in these tests are mocked.
Score queue acknowledgement/offline tests run with
`node --test tests/score-persistence.test.cjs`.

## Limits

This is client-side tamper resistance, not an authoritative anti-cheat system. A
browser owner can replace the scripts before they load, disable the guard, alter
persisted data before a refresh, or send requests outside this page. Scope edits
made while paused inside an authorized callback cannot all be distinguished from
that callback's legitimate writes. Reading Memory images or automating normal
inputs is not detected. JavaScript cannot react while its execution is suspended.
Aborting a request cannot retract a score the server already accepted before
compromise was detected. Stronger guarantees require server-owned game state or
validated replay/input history; existing backend validation remains in place.
