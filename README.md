# Monopoly Game

A real-time multiplayer Monopoly-style web game built with `Express`, `Socket.IO`, and a browser-rendered 3D board.

## What is included

- Real-time lobby and turn-based multiplayer flow
- Browser-rendered 3D board with shared server/client game-state models
- Canonical Capitalista-style 40-slot board template with themed Egypt/Countries overlays
- Property buying, rent, taxes, jail, bankruptcy, auctions, and win detection
- Reconnect support for in-progress matches on the currently running server
- End-game stats and a match summary modal
- Random lobby bots for quick local testing

## Tech stack

- Node.js
- Express
- Socket.IO
- Vanilla JavaScript
- Three.js (loaded from CDN in the client)

## Gameplay features

- Character-select lobby with live readiness updates
- Turn timer with auto-roll and auto-auction timeout handling
- Buy, pass-to-auction, mortgage, unmortgage, upgrade, downgrade, bank sell, and own-auction flows
- Player-to-player trading with validation, stale-offer invalidation, and counter-offers
- Rich action cards, including:
  - direct collect/pay cards
  - movement to exact tiles
  - relative movement
  - nearest railroad movement
  - nearest utility movement
  - collect-from-each-player effects
  - pardon card draws
- Board/rules metadata in live snapshots, including `rulePreset` and `rulesConfig`
- Auction bidding UI with live timer updates
- Match history log, leaderboard, bankruptcy handling, and final placements

## Rule coverage

- Undeveloped monopolies charge double base rent on a fully owned color set
- Double-rent does not apply once buildings are present
- Mortgaged properties collect no rent
- Buildings can be bought unevenly across a color set
- Buildings must be sold evenly across a color set
- A color set cannot be upgraded if any property in that set is mortgaged
- Egypt and Countries maps share the same slot structure, prices, groups, and special-tile behavior
- Asset management actions are limited to the active player during the correct turn phases
- Trades can still be offered and answered outside the active turn
- Group transfer locks prevent trading, mortgaging, selling, or auctioning properties from sets that still contain buildings

## Quality-of-life features

- Session-based reconnect after refresh or temporary disconnect
- In-progress game sync for reconnecting players
- Paused game state when the active human player disconnects
- End-of-match summary with ranking, duration, turn count, and player/property stats
- Random bot players for testing without opening multiple tabs
- Local developer test panel for fast state manipulation while developing

## Getting started

### Requirements

- Node.js 18+ recommended

### Install

```bash
npm install
```

### Run locally

```bash
npm start
```

The app starts on `http://localhost:3000` by default.

You can also override the port.

On macOS or Linux:

```bash
PORT=4000 npm start
```

On PowerShell:

```powershell
$env:PORT=4000
npm start
```

## Available scripts

- `npm start` starts the server
- `npm run dev` runs the same local server command
- `npm run start:test` starts the server for Playwright webServer runs
- `npm test` runs unit tests
- `npm run test:unit` runs shared logic and unit-focused suites
- `npm run test:integration` runs deterministic multiplayer socket integration tests
- `npm run test:stress` runs stress and invariant suites
- `npm run test:all` runs unit, integration, and stress suites
- `npm run test:coverage` runs the non-browser suites with `c8` coverage output
- `npm run test:e2e` runs Playwright browser tests
- `npm run test:ci` runs coverage plus Playwright tests

## Test layers

- `test/shared*.test.js` contains shared model and rule validation suites
- `test/integration/` contains server plus socket multiplayer flow tests
- `test/stress/` contains repeated seeded invariants for edge-case pressure testing
- `test/e2e/` contains browser-based Playwright tests

## Project structure

```text
public/   Client HTML, styles, and browser-side game systems
shared/   Board template/layout data, rule presets, and shared game-state classes
server.js Express and Socket.IO game server
```

## Testing guide

Detailed day-to-day and release testing workflow lives in `TESTING.md`.

## Notes

- Reconnect and save support are in-memory only. Refreshing or reconnecting to the same running server restores your seat, but restarting the Node server resets the match.
- Client-side 3D rendering depends on external CDNs for `three.js` and `OrbitControls`.
- Automated coverage currently focuses on shared rules, trade validation, card resolution, and match summary generation.
