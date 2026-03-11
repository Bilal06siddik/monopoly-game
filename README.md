# Monopoly Game

A real-time multiplayer Monopoly-style web game built with `Express`, `Socket.IO`, and a browser-rendered 3D board.

## What is included

- Real-time lobby and turn-based multiplayer flow
- Property buying, rent, taxes, jail, bankruptcy, and win detection
- Auctions and player-to-player trading
- Shared game state models used by both server and client

## Tech stack

- Node.js
- Express
- Socket.IO
- Vanilla JavaScript
- Three.js (loaded from CDN in the client)

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

## Project structure

```text
public/   Client HTML, styles, and browser-side game systems
shared/   Board data and shared game-state classes
server.js Express and Socket.IO game server
```

## Notes

- Client-side 3D rendering depends on external CDNs for `three.js` and `OrbitControls`.
- There is currently no automated test suite in this repository.

## Cleanup included

- Added a proper `.gitignore`
- Removed unused runtime dependencies
- Added a favicon to avoid the missing asset request in the browser
- Removed a checked-in local error scratch file
