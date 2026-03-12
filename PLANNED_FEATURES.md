# Planned Features

## Next Up

- Monopoly double rent for undeveloped full color sets.
- Even building and even selling across a color group.
- No building on a color set if any property in that set is mortgaged.
- Mostly turn-based asset actions:
  - Only the active player can upgrade, downgrade, mortgage, unmortgage, sell to bank, or start an own-auction.
  - Trades can still be offered outside the active turn.

## Later

- Creditor-aware bankruptcy handling instead of always returning assets to the bank.
- Richer action cards:
  - movement cards,
  - collect-from-each-player cards,
  - pardon-card draws,
  - nearest railroad or utility movement.
- House-rules and settings screen.
- Reconnect and save support for in-progress games.
- Better trade UX with clearer validation and counter-offers.
- End-game stats and match summary.

## Notes / Rule Decisions

- Phase 1 keeps the current board layout, special-tile positions, and current rent values.
- The pasted reference board is used as a property price template only.
- The new anti-loophole rule blocks selling, mortgaging, auctioning, or trading a color-group property while any property in that group still has houses.
