# Testing Playbook

This document is the source of truth for testing this game before sharing a build or merging major gameplay changes.

## 1. Testing layers and purpose

- Unit tests (`test/shared*.test.js`): fast rule and state correctness checks.
- Integration tests (`test/integration/**/*.test.js`): real Socket.IO multiplayer behavior on a live server instance.
- Stress tests (`test/stress/**/*.test.js`): repeated seeded invariants to catch edge cases that appear over many turns.
- E2E tests (`test/e2e/**/*.spec.js`): browser-level real player flow checks.
- Simulation lane (`npm run test:simulation`): an autoplayed full-match logic run plus a browser state tour for buy, auction, jail, trade, and endgame visuals.

## 2. One-time setup

1. Install dependencies:

```bash
npm install
```

2. Install Playwright browser once per machine:

```bash
npx playwright install chromium
```

## 3. Daily workflow (recommended)

Use this order after every non-trivial change.

1. Fast local confidence:

```bash
npm run test:unit
```

2. Server/multiplayer confidence:

```bash
npm run test:integration
```

3. Edge-case confidence:

```bash
npm run test:stress
```

4. Browser confidence:

```bash
npm run test:e2e -- --project=chromium
```

5. Final pre-push gate:

```bash
npm run test:ci
```

## 4. Script reference

- `npm test`: alias for unit tests.
- `npm run test:unit`: shared game logic tests.
- `npm run test:integration`: multiplayer socket integration tests.
- `npm run test:stress`: seeded stress invariants.
- `npm run test:all`: unit + integration + stress.
- `npm run test:simulation`: full-match autoplay simulation plus visual-state capture checks.
- `npm run test:coverage`: c8 coverage report for non-browser tests.
- `npm run test:e2e`: Playwright suite.
- `npm run test:ci`: coverage + e2e (same intent as CI pipeline).

## 5. What to run based on your change

- Changed files under `shared/`: run unit + stress at minimum.
- Changed files under `server.js`: run integration + stress + at least one e2e scenario.
- Changed files under `public/`: run e2e + relevant integration tests for matching socket events.
- Changed trade/auction/turn flow: run all layers.
- Changed cross-cutting gameplay or UI state sync: run `npm run test:simulation`.

## 6. Manual multiplayer checklist (high-value edge cases)

Run this list at least once before release, even when all automation passes.

1. Lobby and start behavior
- Host can create room and copy invite.
- Two players can join and start match.
- Host can add and clear bots before game start.

2. Turn and dice behavior
- Current player can roll exactly once per waiting phase.
- Non-current player gets blocked from rolling.
- Doubles behavior works for extra-roll logic.

3. Buy/pass/auction behavior
- Buy prompt appears only when appropriate.
- Pass starts auction and auction resolves winner correctly.
- Invalid bids are rejected and UI recovers.

4. Trade behavior
- Offer, counter-offer, accept, and reject all complete without stale state errors.
- Property ownership and cash transfer are correct after completion.

5. Disconnect/reconnect behavior
- Active player disconnect pauses match.
- Reconnect resumes match and timer state remains consistent.

6. Save/load boundaries
- Host can save and load game.
- Loaded game preserves ownership, cash, and turn owner.

7. Bankruptcy and end game
- Debt warning appears when expected.
- Bankruptcy transitions are consistent and winner is determined correctly.

## 7. Reproduce flaky multiplayer bugs locally

1. Run integration repeatedly:

```powershell
1..5 | ForEach-Object { npm run test:integration; if ($LASTEXITCODE -ne 0) { break } }
```

2. Run a focused e2e repeatedly:

```bash
npx playwright test test/e2e/lobby-match.spec.js --project=chromium --repeat-each=5
```

3. If failure appears intermittently, keep Playwright traces and compare event ordering.

## 8. CI expectations

GitHub Actions runs two jobs:

- `unit-integration-stress`: coverage-oriented non-browser checks.
- `e2e`: browser tests with artifact upload.

If CI fails:

1. Run the same failing command locally.
2. Fix or stabilize the test.
3. Re-run `npm run test:ci` before pushing again.
