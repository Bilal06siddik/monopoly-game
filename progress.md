Original prompt: we are planning to make a v2 update fot his game so first thing is we need to copy the board size and tiles from this game's code i want the countries map to be the exact same, while keeping egypt map exactly like it too but with different names and then make sure that all the rules and cases in both games are the same

- Initialized v2 Capitalista-parity implementation work.
- Confirmed the reference board uses normal fields `1.5 x 3` and corners `3 x 3`.
- Confirmed current repo already keeps Egypt and Countries on the same 40-slot order, but board geometry and some rule behavior still drift.
- First implementation batch: add shared board layout/rule preset modules and refactor board data into a template plus themed overlays.
- Added `shared/boardLayout.js` for exact Capitalista board dimensions and deterministic tile-position math.
- Added `shared/rulePresets.js` and wired `rulePreset` / `rulesConfig` through room state, game state, saves, and payloads.
- Refactored `shared/boardData.js` so Egypt and Countries are themed overlays over one canonical 40-slot template.
- Updated shared rules to enforce even build/sell parity and updated the live server handlers to use that rule config.
- Updated the 3D board renderer to use the reference `1.5 x 3` tile footprint and `3 x 3` corners.
- Updated map-sensitive action-card text so absolute-destination cards use the active board’s tile names.
- Added tests for board template parity, board layout geometry, rule preset metadata, and live rule-config flag propagation.
- Test status:
  - `npm run test:unit` ✅
  - `npm run test:integration` ✅
  - `npm run test:stress` ✅
  - `npm run test:e2e` ✅
