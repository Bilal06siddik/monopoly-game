import React from 'react';

const COLOR_MAP = {
  brown: '#8c5a3c',
  lightblue: '#90d6f8',
  pink: '#d883c4',
  orange: '#f1aa5d',
  red: '#e96962',
  yellow: '#ead768',
  green: '#66bf7a',
  darkblue: '#5875ee',
  railroad: '#93a2b7',
  utility: '#9ca8b4'
};

const TYPE_META = {
  roll: { icon: '🎲', label: 'Roll' },
  buy: { icon: '🏠', label: 'Buy' },
  sell: { icon: '💱', label: 'Sell' },
  rent: { icon: '💸', label: 'Rent' },
  tax: { icon: '🧾', label: 'Tax' },
  card: { icon: '🃏', label: 'Card' },
  auction: { icon: '🔨', label: 'Auction' },
  bid: { icon: '💵', label: 'Bid' },
  trade: { icon: '🤝', label: 'Trade' },
  pass: { icon: '⏭', label: 'Pass' },
  bankrupt: { icon: '⚠', label: 'Debt' },
  win: { icon: '🏆', label: 'Win' },
  system: { icon: '📣', label: 'System' },
  info: { icon: 'ℹ', label: 'Info' }
};

const AUCTION_INCREMENTS = [2, 5, 10, 25, 50, 100];

function getRules() {
  return window.MonopolyRules || {};
}

function nameOf(player) {
  return player?.name || player?.character || 'Player';
}

function money(value) {
  return `$${Number.isFinite(value) ? value : 0}`;
}

const RAILROAD_RENT_TIERS = [25, 50, 100, 400];

function getRailroadRent(count) {
  const index = Math.min(Math.max(count - 1, 0), RAILROAD_RENT_TIERS.length - 1);
  return RAILROAD_RENT_TIERS[index];
}

function typeMeta(type) {
  const normalized = typeof type === 'string' ? type.trim().toLowerCase() : '';
  return TYPE_META[normalized] || TYPE_META.info;
}

function simplifyHistory(text, type) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Update';
  if (type === 'roll') {
    return normalized.replace(
      /^(.+?) rolled (\d+) and went to (.+?)( \(DOUBLES!\))?$/i,
      (_m, player, total, tile, doubles = '') => `${player} rolled ${total} -> ${tile}${doubles ? ' (doubles)' : ''}`
    );
  }
  if (type === 'rent') {
    return normalized.replace(/^(.+?) paid (\$\d+) rent to (.+?) for (.+)$/i, '$1 paid $2 to $3 ($4)');
  }
  if (type === 'buy') {
    return normalized.replace(/^(.+?) bought (.+?) for (\$\d+)$/i, '$1 bought $2 ($3)');
  }
  return normalized.length > 84 ? `${normalized.slice(0, 83)}…` : normalized;
}

function getTile(state, tileIndex) {
  return state?.properties?.find((item) => item.index === tileIndex) || null;
}

function getMe(state, myPlayerId) {
  return state?.players?.find((player) => player.id === myPlayerId) || null;
}

function getCurrentPlayer(state) {
  return state?.players?.find((player) => player.id === state?.currentPlayerId) || null;
}

function getTurnTimerLabel(phase) {
  return phase === 'waiting' ? 'Roll Timer' : phase === 'buying' ? 'Buy Window' : phase === 'done' ? 'End Turn Timer' : 'Turn Timer';
}

function getRollState(state, myPlayerId) {
  const me = getMe(state, myPlayerId);
  const currentPlayer = getCurrentPlayer(state);
  if (state?.currentPlayerId !== myPlayerId) {
    return { disabled: true, label: 'Waiting', title: `It is ${nameOf(currentPlayer)}'s turn.` };
  }
  if (me?.inJail) return { disabled: true, label: 'Choose Jail Action', title: 'Use a jail action to continue.' };
  if (me?.bankruptcyDeadline || (typeof me?.money === 'number' && me.money < 0)) {
    return { disabled: true, label: 'Recover From Debt', title: 'Recover from debt or declare bankruptcy before continuing.' };
  }
  if (state?.turnPhase === 'waiting') {
    return { disabled: false, label: state?.hasPendingExtraRoll ? '🎲 Roll Again' : '🎲 Roll Dice', title: 'Roll the dice to continue.' };
  }
  const labels = {
    rolling: 'Rolling...',
    moving: 'Resolving Move...',
    buying: 'Choose Buy or Pass',
    auctioning: 'Auction in Progress',
    done: 'Turn Complete'
  };
  return { disabled: true, label: labels[state?.turnPhase] || 'Action In Progress', title: 'Finish the current action before continuing.' };
}

function getEndTurnState(state, myPlayerId) {
  const me = getMe(state, myPlayerId);
  const isMyTurn = state?.currentPlayerId === myPlayerId;
  const canEnd = isMyTurn && state?.turnPhase === 'done' && (typeof me?.money !== 'number' || me.money >= 0);
  return { disabled: !canEnd, hidden: Boolean(isMyTurn && state?.hasPendingExtraRoll) };
}

function canManageAssets(state, myPlayerId) {
  const rules = getRules();
  if (!rules.canManageAssets || !state || !myPlayerId) return false;
  return rules.canManageAssets({ currentPlayerId: state.currentPlayerId, pauseState: state.pauseState, turnPhase: state.turnPhase }, myPlayerId);
}

function displayRent(tile, properties) {
  const rules = getRules();
  if (!tile || !tile.owner) return tile?.price > 0 ? money(tile.price) : '—';
  if (tile.type === 'utility') {
    const count = rules.getOwnedPropertyCount ? rules.getOwnedPropertyCount(properties, tile.owner, 'utility') : 1;
    return count >= 2 ? 'Dice x10' : 'Dice x4';
  }
  if (tile.type === 'railroad') {
    const count = rules.getOwnedPropertyCount ? rules.getOwnedPropertyCount(properties, tile.owner, 'railroad') : 1;
    return money(getRailroadRent(count));
  }
  const amount = rules.calculateRent ? rules.calculateRent(properties, tile, 7) : tile.rent;
  return amount > 0 ? money(amount) : '—';
}

function tileTypeLabel(tile) {
  if (!tile) return 'Property';
  if (tile.type === 'railroad') return 'Railroad';
  if (tile.type === 'utility') return 'Utility';
  if (tile.type === 'property') return tile.colorGroup ? `${tile.colorGroup} Set` : 'Property';
  return tile.type;
}

function propertyActions(state, tile, myPlayerId) {
  const rules = getRules();
  const me = getMe(state, myPlayerId);
  const result = [];
  if (!tile || !me || tile.owner !== myPlayerId) return result;
  const canManage = canManageAssets(state, myPlayerId);
  const groupLocked = Boolean(tile.type === 'property' && tile.colorGroup && state.properties.some((entry) => entry.type === 'property' && entry.colorGroup === tile.colorGroup && entry.houses > 0));
  const mortgagedGroup = Boolean(tile.type === 'property' && tile.colorGroup && state.properties.some((entry) => entry.type === 'property' && entry.colorGroup === tile.colorGroup && entry.isMortgaged));

  function push(id, title, subtitle, disabled, reason) {
    result.push({ id, title, subtitle, disabled, reason });
  }

  if (tile.type === 'property') {
    const upgradeCost = Math.floor(tile.price * 0.5);
    const downgradeRefund = Math.floor(tile.price * 0.25);
    const upgradeValidation = rules.validateUpgrade ? rules.validateUpgrade(state.properties, myPlayerId, tile.index) : { ok: false, message: 'Unavailable' };
    const downgradeValidation = rules.validateDowngrade ? rules.validateDowngrade(state.properties, myPlayerId, tile.index) : { ok: false, message: 'Unavailable' };

    if (!tile.isMortgaged && tile.houses < 5) {
      push('upgrade', 'Upgrade', money(upgradeCost), !canManage || mortgagedGroup || !upgradeValidation.ok || me.money < upgradeCost, !canManage ? 'Only the active player can build right now.' : mortgagedGroup ? 'Unmortgage the full color set before building.' : !upgradeValidation.ok ? upgradeValidation.message : `Need ${money(upgradeCost)} to upgrade.`);
    }
    if (tile.houses > 0) {
      push('downgrade', 'Downgrade', `+${money(downgradeRefund).slice(1)}`, !canManage || !downgradeValidation.ok, !canManage ? 'Only the active player can sell buildings right now.' : downgradeValidation.message);
    }
  }

  if (!tile.isMortgaged) {
    push('mortgage', 'Mortgage', `+${money(Math.floor(tile.price / 2)).slice(1)}`, !canManage || groupLocked, !canManage ? 'Only the active player can mortgage property right now.' : groupLocked ? 'Sell all buildings in this color set first.' : '');
  } else {
    const unmortgageCost = Math.floor(tile.price * 0.55);
    push('unmortgage', 'Unmortgage', money(unmortgageCost), !canManage || me.money < unmortgageCost, !canManage ? 'Only the active player can unmortgage property right now.' : `Need ${money(unmortgageCost)} to unmortgage.`);
  }

  push('sell', 'Sell to Bank', '', !canManage || groupLocked, !canManage ? 'Only the active player can sell property right now.' : groupLocked ? 'Sell all buildings in this color set first.' : '');
  return result;
}

function tradeSummary(state, cash, properties) {
  const parts = [];
  if (cash > 0) parts.push(money(cash));
  properties.forEach((index) => parts.push(getTile(state, index)?.name || `Property #${index}`));
  return parts.length ? parts.join(' • ') : 'Nothing';
}

function incomingTrade(snapshot) {
  const tradeId = snapshot.ui?.tradeIncomingModalTradeId;
  return (snapshot.ui?.pendingTrades || snapshot.gameState?.pendingTrades || []).find((trade) => trade.id === tradeId) || null;
}

function Modal({ id, children, onBackdropClick, translucent = false }) {
  return (
    <div id={id} className={`gpu-modal-backdrop${translucent ? ' is-translucent' : ''}`} onClick={onBackdropClick}>
      {children}
    </div>
  );
}

function Panel({ title, kicker, action, children, className = '' }) {
  return (
    <section className={`gpu-panel ${className}`.trim()}>
      <div className="gpu-panel-header">
        <div>
          {kicker ? <div className="gpu-panel-kicker">{kicker}</div> : null}
          <h3>{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TopBar({ snapshot }) {
  const state = snapshot.gameState;
  const currentPlayer = getCurrentPlayer(state);
  const timer = state?.pauseState ? null : state?.turnTimer;
  const label = state?.pauseState
    ? `Paused: waiting for ${state.pauseState.character}`
    : state?.currentPlayerId === snapshot.myPlayerId
      ? `${state?.hasPendingExtraRoll ? 'Roll Again' : 'Your Turn'}${currentPlayer?.inJail ? ` • Jail ${currentPlayer.jailTurns}/3` : ''}`
      : `${nameOf(currentPlayer)}'s Turn${currentPlayer?.inJail ? ` • Jail ${currentPlayer.jailTurns}/3` : ''}`;

  return (
    <div className="gpu-top-bar">
      <div id="turn-indicator" className={`gpu-pill gpu-status-pill ${state?.pauseState ? 'is-danger' : state?.currentPlayerId === snapshot.myPlayerId ? 'is-accent' : ''}`}>{label}</div>
      {timer ? <div id="turn-timer" className={`gpu-pill gpu-status-pill ${timer.remainingSeconds <= 10 ? 'is-danger' : ''}`}><span className="gpu-room-label">{getTurnTimerLabel(timer.phase)}</span><strong>{timer.remainingSeconds}s</strong></div> : null}
      <div className="gpu-pill gpu-room-pill is-dim"><span className="gpu-room-label">Room</span><strong>{snapshot.roomCode || '------'}</strong></div>
    </div>
  );
}

function ViewRail({ snapshot, actions }) {
  const state = snapshot.gameState;
  const me = getMe(state, snapshot.myPlayerId);
  const dockOpen = snapshot.viewMode !== 'top-down' ? true : snapshot.ui?.viewDockOpen;
  return (
    <div className="gpu-left-rail">
      <button id="view-dock-toggle" className="gpu-utility-toggle" type="button" aria-expanded={dockOpen} onClick={actions.toggleViewDock}>
        {dockOpen ? 'Hide Views' : 'View Modes'}
      </button>
      <div id="view-dock" className={`gpu-view-dock${dockOpen ? '' : ' is-hidden'}`}>
        <button id="camera-iso-btn" className={snapshot.viewMode === 'isometric' ? 'is-active' : ''} type="button" onClick={() => actions.setViewMode('isometric')}>Isometric</button>
        <button id="camera-view-btn" className={snapshot.viewMode === 'third-person' ? 'is-active' : ''} type="button" disabled={!me?.isActive} onClick={() => actions.setViewMode('third-person')}>Third Person</button>
        <button id="camera-topdown-btn" className={snapshot.viewMode === 'top-down' ? 'is-active' : ''} type="button" onClick={() => actions.setViewMode('top-down')}>Top Down</button>
        <button id="camera-reset-btn" type="button" className="is-secondary" onClick={actions.resetView}>Reset View</button>
      </div>
    </div>
  );
}

function ActionDock({ snapshot, actions }) {
  const state = snapshot.gameState;
  const me = getMe(state, snapshot.myPlayerId);
  const roll = getRollState(state, snapshot.myPlayerId);
  const endTurn = getEndTurnState(state, snapshot.myPlayerId);
  const overflowOpen = snapshot.ui?.overflowOpen;
  const canManage = canManageAssets(state, snapshot.myPlayerId);
  const canDeclareBankruptcy = Boolean(me?.isActive && (me?.bankruptcyDeadline || (typeof me?.money === 'number' && me.money < 0)));
  const hasAuctionableProperty = (state?.properties || []).some((property) => property.owner === snapshot.myPlayerId && !(property.type === 'property' && property.colorGroup && state.properties.some((entry) => entry.type === 'property' && entry.colorGroup === property.colorGroup && entry.houses > 0)));
  const showJail = Boolean(me?.inJail && state?.currentPlayerId === snapshot.myPlayerId && !state?.pauseState);

  return (
    <div className="gpu-action-zone">
      <div className="gpu-action-dock">
        <button id="roll-dice-btn" className="gpu-primary-btn gpu-slim-btn" type="button" disabled={roll.disabled} title={roll.title} onClick={actions.rollDice}>{roll.label}</button>
        <button id="end-turn-btn" className={`gpu-secondary-btn gpu-slim-btn${endTurn.hidden ? ' is-hidden' : ''}`} type="button" disabled={endTurn.disabled} onClick={actions.endTurn}>⏭ End Turn</button>
        <div className="gpu-overflow">
          <button id="action-overflow-btn" className="gpu-icon-btn" type="button" aria-expanded={overflowOpen} onClick={actions.toggleOverflow}>More</button>
          <div id="action-overflow-menu" className={`gpu-popover${overflowOpen ? '' : ' is-hidden'}`}>
            <button id="own-auction-btn" type="button" disabled={!canManage || !hasAuctionableProperty} onClick={actions.openOwnAuction}>Own Auction</button>
            <button id="declare-bankruptcy-btn" type="button" disabled={!canDeclareBankruptcy} onClick={actions.declareBankruptcy}>Declare Bankruptcy</button>
          </div>
        </div>
      </div>
      <div id="jail-actions" className={`gpu-jail-card${showJail ? '' : ' is-hidden'}`}>
        <button id="jail-roll-btn" type="button" disabled={state?.turnPhase !== 'waiting'} onClick={actions.jailRoll}>🎲 Roll for Doubles</button>
        <button id="jail-buyout-btn" type="button" disabled={(me?.money || 0) < 50} onClick={actions.buyOutJail}>💸 Pay $50 and End Turn</button>
        <button id="jail-pardon-btn" type="button" disabled={!me?.pardons} onClick={actions.usePardon}>🃏 Use Pardon {me?.pardons ? `(${me.pardons})` : ''}</button>
      </div>
    </div>
  );
}

function Leaderboard({ snapshot, actions }) {
  const state = snapshot.gameState;
  const players = [...(state?.players || [])].sort((a, b) => (a.isActive !== b.isActive ? (a.isActive ? -1 : 1) : b.money - a.money));
  const collapsed = snapshot.ui?.leaderboardCollapsed;
  const isHostViewer = Boolean(state?.hostPlayerId && state.hostPlayerId === snapshot.myPlayerId);
  return (
    <Panel title="Leaderboard" kicker="Table Standings" className={collapsed ? 'is-collapsed' : ''} action={<button id="leaderboard-collapse-btn" className="gpu-icon-btn" type="button" aria-expanded={!collapsed} onClick={actions.toggleLeaderboard}>{collapsed ? 'Open' : 'Hide'}</button>}>
      {!collapsed ? (
        <div id="leaderboard-panel" className="gpu-stack">
          {players.map((player, index) => {
            const propertyCount = (state?.properties || []).filter((item) => item.owner === player.id).length;
            return (
              <article key={player.id} className={`gpu-player-card${player.id === snapshot.myPlayerId ? ' is-me' : ''}${!player.isActive ? ' is-out' : ''}`}>
                <div className="gpu-rank">#{index + 1}</div>
                <div className="gpu-grow">
                  <div className="gpu-inline gpu-player-head"><strong style={{ color: player.color }}>{nameOf(player)}</strong>{player.id === state?.hostPlayerId ? <span className="gpu-tag">Host</span> : null}{!player.isConnected ? <span className="gpu-tag is-warn">Offline</span> : null}{player.inJail ? <span className="gpu-tag is-neutral">Jail</span> : null}{!player.isActive ? <span className="gpu-tag is-danger">Bankrupt</span> : null}</div>
                  <div className="gpu-inline is-dim gpu-player-meta"><span>{money(player.money)}</span><span>{propertyCount} properties</span></div>
                </div>
                <div className="gpu-inline gpu-player-actions">
                  {player.id !== snapshot.myPlayerId && player.isActive ? <button type="button" onClick={() => actions.openTradeComposer(player.id)}>Trade</button> : null}
                  {isHostViewer && player.id !== snapshot.myPlayerId ? <button type="button" className="is-danger" onClick={() => actions.kickPlayer(player.id, nameOf(player))}>Kick</button> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </Panel>
  );
}

function HostControls({ snapshot, actions }) {
  const state = snapshot.gameState;
  const isHost = Boolean(state?.hostPlayerId && state.hostPlayerId === snapshot.myPlayerId);
  if (!isHost) return null;
  const open = Boolean(snapshot.ui?.hostControlsOpen);
  const timerEnabled = state?.turnTimerEnabled !== false;
  const canExtend = timerEnabled && state?.isGameStarted && state?.turnTimer && !state?.pauseState;
  return (
    <>
      <div className="gpu-host-launcher">
        <button id="host-controls-toggle" className="gpu-host-toggle" type="button" aria-expanded={open} onClick={actions.toggleHostControls}>
          {open ? 'Close Host Tools' : 'Host Tools'}
        </button>
      </div>
      {open ? (
        <Modal id="host-controls-modal" translucent onBackdropClick={(event) => { if (event.target.id === 'host-controls-modal') actions.toggleHostControls(); }}>
          <section className="gpu-modal-card gpu-host-popup-card">
            <div className="gpu-panel-header">
              <div>
                <div className="gpu-panel-kicker">Host Controls</div>
                <h2>Room & Match</h2>
              </div>
              <button className="gpu-icon-btn" type="button" onClick={actions.toggleHostControls}>Close</button>
            </div>
            <div id="persistent-host-controls" className="gpu-host-popup-grid">
              <section className="gpu-host-popup-section gpu-stack">
                <div className="gpu-panel-kicker">Session</div>
                <div className="gpu-host-action-grid">
                  <button id="save-game-btn" type="button" disabled={!state?.isGameStarted} onClick={actions.saveGame}>Save Game</button>
                  <button id="load-game-btn" type="button" disabled={state?.isGameStarted} onClick={actions.loadGame}>Load Game</button>
                  <button id="host-copy-room-link-btn" type="button" onClick={actions.copyInvite}>Copy Invite</button>
                  <button id="host-end-match-btn" type="button" disabled={!state?.isGameStarted} onClick={actions.endMatch}>End Match</button>
                  <button id="host-end-room-btn" type="button" className="is-danger" onClick={actions.endRoom}>End Room</button>
                </div>
              </section>
              <section className="gpu-host-popup-section gpu-stack">
                <div className="gpu-panel-kicker">Turn Timer</div>
                <label className="gpu-host-toggle-row" htmlFor="host-turn-timer-enabled">
                  <input id="host-turn-timer-enabled" type="checkbox" checked={timerEnabled} onChange={(event) => actions.setTurnTimerEnabled(event.target.checked)} />
                  <span>Enable automatic turn timer</span>
                </label>
                <div className="gpu-inline">
                  <button id="host-extend-timer-15-btn" type="button" disabled={!canExtend} onClick={() => actions.extendTurnTimer(15)}>Add 15s</button>
                  <button id="host-extend-timer-30-btn" type="button" disabled={!canExtend} onClick={() => actions.extendTurnTimer(30)}>Add 30s</button>
                </div>
                <p id="host-turn-timer-status" className="gpu-helper-text">{!timerEnabled ? 'Turn timer is disabled.' : state?.pauseState ? 'Game is paused. Timer will resume when play resumes.' : state?.turnTimer ? `${getTurnTimerLabel(state.turnTimer.phase)}: ${state.turnTimer.remainingSeconds}s remaining.` : 'No active timer right now.'}</p>
              </section>
              <section className="gpu-host-popup-section gpu-stack">
                <div className="gpu-panel-kicker">Players</div>
                <div className="gpu-scroll gpu-stack gpu-host-player-list">
                  {state.players.filter((player) => player.id !== snapshot.myPlayerId).map((player) => (
                    <div key={player.id} className="gpu-host-player-row">
                      <div className="gpu-grow">
                        <strong>{nameOf(player)}</strong>
                        <div className="gpu-inline is-dim"><span>{player.isBot ? 'Bot' : 'Player'}</span><span>{player.isConnected ? 'Online' : 'Offline'}</span>{!player.isActive ? <span>Out</span> : null}</div>
                      </div>
                      <button type="button" className="is-danger" onClick={() => actions.kickPlayer(player.id, nameOf(player))}>Kick</button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </Modal>
      ) : null}
    </>
  );
}

function Feed({ snapshot, actions }) {
  const activeTab = snapshot.ui?.lowerTab || 'history';
  const expanded = snapshot.ui?.lowerExpanded;
  const collapsed = snapshot.ui?.lowerCollapsed;
  const historyEvents = snapshot.ui?.historyEvents || snapshot.gameState?.historyEvents || [];
  const trades = snapshot.ui?.pendingTrades || snapshot.gameState?.pendingTrades || [];
  const state = snapshot.gameState;
  return (
    <Panel title="" className={`gpu-feed-panel${expanded ? ' is-expanded' : ''}${collapsed ? ' is-collapsed' : ''}`} action={<div className="gpu-inline"><button id="history-expand-btn" className="gpu-icon-btn" type="button" aria-expanded={expanded} onClick={actions.toggleFeedExpanded}>{expanded ? 'Collapse' : 'Expand'}</button><button id="history-collapse-btn" className="gpu-icon-btn" type="button" aria-expanded={!collapsed} onClick={actions.toggleFeedCollapsed}>{collapsed ? 'Open' : 'Hide'}</button></div>}>
      <div className="gpu-inline gpu-feed-tabs">
        <button id="tab-history" className={activeTab === 'history' ? 'is-active' : ''} type="button" onClick={() => actions.setLowerTab('history')}>History</button>
        <button id="tab-trades" className={activeTab === 'trades' ? 'is-active' : ''} type="button" onClick={() => actions.setLowerTab('trades')}>Trades (<span id="trades-count">{trades.length}</span>)</button>
      </div>
      {!collapsed ? (
        <>
          <div id="history-content" className={`gpu-stack${activeTab === 'history' ? '' : ' is-hidden'}`}>
            <div id="history-log-list" className="gpu-scroll gpu-feed-scroll">
              {[...historyEvents].reverse().map((event, index) => {
                const meta = typeMeta(event.type);
                return (
                  <article key={`${event.text}-${index}`} className="gpu-history-item">
                    <span className="gpu-history-icon">{meta.icon}</span>
                    <div className="gpu-grow">
                      <div className="gpu-history-type">{meta.label}</div>
                      <div className="gpu-history-text">{simplifyHistory(event.text, (event.type || '').toLowerCase())}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
          <div id="trades-content" className={`gpu-stack${activeTab === 'trades' ? '' : ' is-hidden'}`}>
            {trades.length ? trades.map((trade) => {
              const outgoing = trade.fromId === snapshot.myPlayerId;
              return (
                <article key={trade.id} className={`gpu-trade-card${outgoing ? ' is-outgoing' : ''}`}>
                  <div className="gpu-inline gpu-space-between"><strong>{trade.isCounterOffer ? 'Counter-offer' : 'Trade Offer'} {outgoing ? `to ${trade.toCharacter}` : `from ${trade.fromCharacter}`}</strong><span className={`gpu-tag${outgoing ? '' : ' is-warn'}`}>{outgoing ? 'Waiting' : 'Incoming'}</span></div>
                  <div className="gpu-trade-line"><span>{outgoing ? 'You offer' : 'They offer'}</span><strong>{tradeSummary(state, trade.offerCash, trade.offerProperties || [])}</strong></div>
                  <div className="gpu-trade-line"><span>{outgoing ? 'You want' : 'They want'}</span><strong>{tradeSummary(state, trade.requestCash, trade.requestProperties || [])}</strong></div>
                  <div className="gpu-inline gpu-trade-inline-actions">
                    {outgoing ? <button type="button" className="is-danger" onClick={() => actions.cancelTrade(trade.id)}>Cancel</button> : <><button type="button" onClick={() => actions.acceptTrade(trade.id)}>Accept</button><button type="button" className="is-danger" onClick={() => actions.rejectTrade(trade.id)}>Decline</button><button type="button" onClick={() => actions.counterTrade(trade.id)}>Counter</button></>}
                  </div>
                </article>
              );
            }) : <div className="gpu-empty-state">No trades yet.</div>}
          </div>
        </>
      ) : null}
    </Panel>
  );
}

function BuyModal({ snapshot, actions }) {
  const prompt = snapshot.ui?.buyPrompt;
  if (!prompt) return null;
  return (
    <Modal id="buy-modal" onBackdropClick={(event) => { if (event.target.id === 'buy-modal') actions.passProperty(); }}>
      <div className="gpu-modal-card gpu-buy-card gpu-spotlight-card">
        <div className="gpu-modal-kicker">{prompt.tileType === 'railroad' ? 'Railroad' : prompt.tileType === 'utility' ? 'Utility' : 'Property Drawn'}</div>
        <h2>{prompt.tileName}</h2>
        <div className="gpu-buy-price">{money(prompt.price)}</div>
        <div className="gpu-buy-caption">Choose what happens next.</div>
        <div className="gpu-inline gpu-buy-actions">
          <button id="buy-btn" className="gpu-hero-btn" type="button" disabled={!prompt.canAfford} onClick={() => actions.buyProperty(prompt.tileIndex)}>{prompt.canAfford ? 'Buy' : 'Too Expensive'}</button>
          <button id="pass-btn" type="button" className="is-secondary" onClick={actions.passProperty}>Auction</button>
        </div>
      </div>
    </Modal>
  );
}

function AuctionModal({ snapshot, actions }) {
  const auction = snapshot.ui?.auctionState || snapshot.gameState?.auctionState;
  const state = snapshot.gameState;
  if (!auction) return null;
  const me = getMe(state, snapshot.myPlayerId);
  const timerMax = auction.timerMaxSeconds > 0 ? auction.timerMaxSeconds : auction.currentBidderId ? (auction.bidResetSeconds || 5) : 15;
  const timerPct = Math.max(0, Math.min(100, (auction.timeRemaining / timerMax) * 100));
  const quickBids = AUCTION_INCREMENTS.map((increment) => {
    const nextBid = auction.currentBid + increment;
    return {
      increment,
      nextBid,
      disabled: (me?.money || 0) < nextBid
    };
  });
  return (
    <Modal id="auction-modal">
      <div className="gpu-modal-card gpu-auction-card">
        <div className="gpu-inline gpu-space-between">
          <div><div className="gpu-modal-kicker">Live Auction</div><h2>{auction.tileName}</h2></div>
          <div className={`gpu-current-bid${auction.currentBidderId ? ' is-active' : ''}`}>
            <span>{auction.currentBidderCharacter || 'No bids yet'}</span>
            <strong>{money(auction.currentBid || 0)}</strong>
          </div>
        </div>
        <div className="gpu-progress-track"><div className="gpu-progress-fill" style={{ width: `${timerPct}%` }} /></div>
        <div className="gpu-auction-timer-line"><span>Round clock</span><strong>{Math.max(0, Math.ceil(auction.timeRemaining || 0))}s left</strong></div>
        <div className="gpu-three-col">
          <section className="gpu-stack"><h3>Property</h3><div className="gpu-stat-box"><span>Type</span><strong>{auction.tileType}</strong></div><div className="gpu-stat-box"><span>Price</span><strong>{money(auction.tilePrice)}</strong></div><div className="gpu-stat-box"><span>Rent</span><strong>{money(auction.tileRent)}</strong></div></section>
          <section className="gpu-stack">
            <h3>Quick Bids</h3>
            <div className="gpu-auction-summary">
              <div className="gpu-stat-box"><span>Minimum next bid</span><strong>{money((auction.currentBid || 0) + 2)}</strong></div>
              <div className="gpu-stat-box"><span>Your cash</span><strong>{money(me?.money || 0)}</strong></div>
            </div>
            <div id="auc-bid-grid" className="gpu-chip-grid gpu-auction-bids">
              {quickBids.map(({ increment, nextBid, disabled }) => (
                <button key={increment} type="button" className="gpu-auction-bid-btn" disabled={disabled} onClick={() => actions.placeBid(nextBid)}>
                  <span className="gpu-auction-bid-label">Bid +{money(increment).slice(1)}</span>
                  <strong>{money(nextBid)}</strong>
                </button>
              ))}
            </div>
          </section>
          <section className="gpu-stack"><h3>Players</h3><div className="gpu-scroll">{state.players.filter((player) => player.isActive).map((player) => <div key={player.id} className={`gpu-mini-player${player.id === auction.currentBidderId ? ' is-leading' : ''}`}><span style={{ color: player.color }}>{nameOf(player)}</span><strong>{money(player.money)}</strong></div>)}</div></section>
        </div>
      </div>
    </Modal>
  );
}

function OwnAuctionModal({ snapshot, actions }) {
  const ownAuction = snapshot.ui?.ownAuction;
  const state = snapshot.gameState;
  if (!ownAuction?.open) return null;
  const myProperties = (state?.properties || []).filter((property) => property.owner === snapshot.myPlayerId);
  const selected = getTile(state, ownAuction.selectedTileIndex);
  const maxValue = selected ? selected.price + (selected.houses * Math.floor(selected.price * 0.25)) : 0;
  return (
    <Modal id="own-auction-modal" onBackdropClick={(event) => { if (event.target.id === 'own-auction-modal') actions.closeOwnAuction(); }}>
      <div className="gpu-modal-card">
        {!selected ? (
          <>
            <div className="gpu-modal-kicker">Own Auction</div>
            <h2>Select a property to auction</h2>
            <div className="gpu-scroll gpu-stack">
              {myProperties.length ? myProperties.map((property) => <button key={property.index} type="button" className="gpu-row-btn" onClick={() => actions.selectOwnAuctionProperty(property.index)}><div><strong>{property.name}</strong><div className="gpu-helper-text">{property.houses >= 5 ? 'Hotel' : property.houses ? `${property.houses} buildings` : 'No buildings'}</div></div><strong>{money(Math.floor(property.price / 2))}+</strong></button>) : <div className="gpu-empty-state">No eligible properties.</div>}
            </div>
          </>
        ) : (
          <>
            <div className="gpu-modal-kicker">Configure Auction</div>
            <h2>{selected.name}</h2>
            <div className="gpu-stack">
              <label className="gpu-stack"><span>Reset timer</span><div className="gpu-chip-grid">{[3, 6, 9].map((seconds) => <button key={seconds} type="button" className={ownAuction.timeSeconds === seconds ? 'is-active' : ''} onClick={() => actions.setOwnAuctionTime(seconds)}>{seconds}s</button>)}</div></label>
              <label className="gpu-stack"><span>Start price: {money(ownAuction.startPrice)}</span><input type="range" min="0" max={maxValue} step="10" value={ownAuction.startPrice} onChange={(event) => actions.setOwnAuctionPrice(Number.parseInt(event.target.value, 10) || 0)} /></label>
            </div>
          </>
        )}
        <div className="gpu-inline">{selected ? <button id="oa-conduct-btn" type="button" onClick={actions.submitOwnAuction}>Conduct Auction</button> : null}<button id="own-auction-close" type="button" className="is-secondary" onClick={actions.closeOwnAuction}>Close</button></div>
      </div>
    </Modal>
  );
}

function TradeComposerModal({ snapshot, actions }) {
  const state = snapshot.gameState;
  const composer = snapshot.ui?.tradeComposer;
  if (!composer?.open) return null;
  const me = getMe(state, snapshot.myPlayerId);
  const target = state.players.find((player) => player.id === composer.targetId);
  if (!me || !target) return null;
  const myProperties = state.properties.filter((item) => item.owner === snapshot.myPlayerId);
  const targetProperties = state.properties.filter((item) => item.owner === composer.targetId);
  const offerSummary = tradeSummary(state, composer.offerCash, composer.offerProperties);
  const requestSummary = tradeSummary(state, composer.requestCash, composer.requestProperties);
  return (
    <Modal id="trade-modal" onBackdropClick={(event) => { if (event.target.id === 'trade-modal') actions.closeTradeComposer(); }}>
      <div className="gpu-modal-card gpu-trade-card">
        <div className="gpu-trade-layout">
          <aside className="gpu-trade-hero">
            <div className="gpu-modal-kicker">{composer.counterTradeId ? 'Counter Offer' : 'Trade Offer'}</div>
            <h2>{nameOf(me)} ⇄ {nameOf(target)}</h2>
            <div className="gpu-trade-avatars">
              <div className="gpu-trade-person">
                <span className="gpu-trade-badge" style={{ color: me.color }}>{nameOf(me)}</span>
                <strong>{money(me.money)}</strong>
                <span className="gpu-helper-text">Your side</span>
              </div>
              <div className="gpu-trade-arrow">⇄</div>
              <div className="gpu-trade-person">
                <span className="gpu-trade-badge" style={{ color: target.color }}>{nameOf(target)}</span>
                <strong>{money(target.money)}</strong>
                <span className="gpu-helper-text">Their side</span>
              </div>
            </div>
          </aside>
          <section className="gpu-trade-lane">
            <div className="gpu-trade-lane-head">
              <div>
                <div className="gpu-panel-kicker">You Give</div>
                <h3>You Offer</h3>
              </div>
              <strong>{money(composer.offerCash || 0)}</strong>
            </div>
            <div id="trade-my-props" className="gpu-scroll gpu-stack gpu-trade-property-list">
              {myProperties.length ? myProperties.map((property) => (
                <button key={property.index} type="button" className={`gpu-row-btn gpu-trade-property${composer.offerProperties.includes(property.index) ? ' is-active' : ''}`} onClick={() => actions.toggleTradeProperty('offer', property.index)}>
                  <div>
                    <strong>{property.name}</strong>
                    <div className="gpu-helper-text">{property.isMortgaged ? 'Mortgaged' : property.houses >= 5 ? 'Hotel' : property.houses ? `${property.houses} buildings` : 'Property'}</div>
                  </div>
                  <span className="gpu-trade-pick">{composer.offerProperties.includes(property.index) ? 'Selected' : 'Add'}</span>
                </button>
              )) : <div className="gpu-empty-state">No properties</div>}
            </div>
            <label className="gpu-stack gpu-trade-cash-card">
              <span>Cash Offer</span>
              <input id="trade-my-cash" className="gpu-trade-input" type="number" min="0" value={composer.offerCash} onChange={(event) => actions.setTradeCash('offer', event.target.value)} />
            </label>
          </section>
          <section className="gpu-trade-lane">
            <div className="gpu-trade-lane-head">
              <div>
                <div className="gpu-panel-kicker">You Want</div>
                <h3>You Request</h3>
              </div>
              <strong>{money(composer.requestCash || 0)}</strong>
            </div>
            <div id="trade-target-props" className="gpu-scroll gpu-stack gpu-trade-property-list">
              {targetProperties.length ? targetProperties.map((property) => (
                <button key={property.index} type="button" className={`gpu-row-btn gpu-trade-property${composer.requestProperties.includes(property.index) ? ' is-active' : ''}`} onClick={() => actions.toggleTradeProperty('request', property.index)}>
                  <div>
                    <strong>{property.name}</strong>
                    <div className="gpu-helper-text">{property.isMortgaged ? 'Mortgaged' : property.houses >= 5 ? 'Hotel' : property.houses ? `${property.houses} buildings` : 'Property'}</div>
                  </div>
                  <span className="gpu-trade-pick">{composer.requestProperties.includes(property.index) ? 'Selected' : 'Add'}</span>
                </button>
              )) : <div className="gpu-empty-state">No properties</div>}
            </div>
            <label className="gpu-stack gpu-trade-cash-card">
              <span>Cash Request</span>
              <input id="trade-target-cash" className="gpu-trade-input" type="number" min="0" value={composer.requestCash} onChange={(event) => actions.setTradeCash('request', event.target.value)} />
            </label>
          </section>
          <aside className="gpu-trade-sidebar">
            <div className="gpu-trade-summary-card">
              <div className="gpu-panel-kicker">Deal Summary</div>
              <div className="gpu-trade-summary-line"><span>You give</span><strong>{offerSummary}</strong></div>
              <div className="gpu-trade-summary-line"><span>You get</span><strong>{requestSummary}</strong></div>
            </div>
            {composer.validation?.message ? <div id="trade-validation" className={`gpu-validation${composer.validation.ok === false ? ' is-error' : ''}`}>{composer.validation.message}</div> : <div id="trade-validation" className="gpu-validation is-hidden" />}
            <div id="trade-summary" className="gpu-helper-text gpu-trade-helper">Review both sides before sending. Selected properties stay highlighted until you change them.</div>
            <div className="gpu-stack gpu-trade-actions">
              <button id="trade-send-btn" type="button" onClick={actions.submitTradeOffer}>{composer.counterTradeId ? 'Send Counter' : 'Send Offer'}</button>
              <button id="trade-cancel-btn" type="button" className="is-secondary" onClick={actions.closeTradeComposer}>Close</button>
            </div>
          </aside>
        </div>
      </div>
    </Modal>
  );
}

function TradeIncomingModal({ snapshot, actions }) {
  const trade = incomingTrade(snapshot);
  if (!trade) return null;
  const state = snapshot.gameState;
  return (
    <Modal id="trade-incoming-modal" onBackdropClick={(event) => { if (event.target.id === 'trade-incoming-modal') actions.closeIncomingTradeModal(); }}>
      <div className="gpu-modal-card gpu-buy-card gpu-trade-incoming-card">
        <div className="gpu-modal-kicker">{trade.isCounterOffer ? 'Counter Offer' : 'Incoming Trade'}</div>
        <h2>{trade.fromCharacter} wants to trade</h2>
        <div className="gpu-trade-line"><span>They offer</span><strong>{tradeSummary(state, trade.offerCash, trade.offerProperties || [])}</strong></div>
        <div className="gpu-trade-line"><span>They want</span><strong>{tradeSummary(state, trade.requestCash, trade.requestProperties || [])}</strong></div>
        <div className="gpu-inline gpu-trade-inline-actions"><button id="trade-accept-btn" type="button" onClick={() => actions.acceptTrade(trade.id)}>Accept</button><button id="trade-reject-btn" type="button" className="is-danger" onClick={() => actions.rejectTrade(trade.id)}>Reject</button><button type="button" className="is-secondary" onClick={() => actions.counterTrade(trade.id)}>Counter</button></div>
      </div>
    </Modal>
  );
}

function PropertyModal({ snapshot, actions }) {
  const state = snapshot.gameState;
  const tile = getTile(state, snapshot.ui?.propertyDetailsTileIndex);
  const me = getMe(state, snapshot.myPlayerId);
  if (!tile || tile.type === 'corner') return null;
  const owner = state.players.find((player) => player.id === tile.owner);
  const accent = Number.isFinite(tile?.color) ? `#${tile.color.toString(16).padStart(6, '0')}` : COLOR_MAP[tile.colorGroup] || COLOR_MAP[tile.type] || '#8aa1bc';
  const actionsList = propertyActions(state, tile, snapshot.myPlayerId);
  const ownedCount = owner ? state.properties.filter((property) => property.owner === owner.id).length : 0;
  const currentValueLabel = tile.owner ? 'Current Rent' : 'Buy Price';
  const currentValue = tile.owner ? displayRent(tile, state.properties) : money(tile.price || 0);
  const mortgageValue = tile.price ? money(Math.floor(tile.price / 2)) : '—';
  const statusLabel = tile.isMortgaged ? 'Mortgaged' : owner ? 'Owned' : 'Unowned';
  return (
    <Modal id="prop-details-modal" onBackdropClick={(event) => { if (event.target.id === 'prop-details-modal') actions.closePropertyDetails(); }}>
      <div className="gpu-modal-card gpu-property-card">
        <div className="gpu-property-hero" style={{ '--gpu-property-accent': accent }}>
          <div className="gpu-property-header">
            <div className="gpu-property-accent" style={{ background: accent }} />
            <div className="gpu-property-title-wrap">
              <div className="gpu-modal-kicker">{tileTypeLabel(tile)}</div>
              <h2 id="pd-name">{tile.name}</h2>
              <div className="gpu-inline gpu-property-subline">
                <span className="gpu-tag">{statusLabel}</span>
                {owner ? <span className="gpu-helper-text">{nameOf(owner)} controls {ownedCount} assets</span> : <span className="gpu-helper-text">Open to buy, trade, or auction.</span>}
              </div>
            </div>
            <div className="gpu-property-hero-value">
              <span>{currentValueLabel}</span>
              <strong id="pd-price">{currentValue}</strong>
            </div>
            <button id="pd-close-btn" className="gpu-icon-btn" type="button" onClick={actions.closePropertyDetails}>Close</button>
          </div>
        </div>
        <div className="gpu-property-layout">
          <section className="gpu-stack gpu-property-main">
            <div className="gpu-property-stat-grid">
              <div className="gpu-stat-box"><span>Owner</span><strong id="pd-owner" style={{ color: owner?.color || '#eef4fb' }}>{owner ? nameOf(owner) : 'Unowned'}</strong></div>
              <div className="gpu-stat-box"><span>Landed</span><strong id="pdm-landed-count">{tile.landedCount || 0}</strong></div>
              <div className="gpu-stat-box"><span>Rent Collected</span><strong id="pdm-rent-collected">{money(tile.rentCollected || 0)}</strong></div>
              <div className="gpu-stat-box"><span>Your Cash</span><strong id="pdm-my-cash">{money(me?.money || 0)}</strong></div>
            </div>
            <section className="gpu-property-section">
              <div className="gpu-property-section-head">
                <div>
                  <div className="gpu-panel-kicker">Value Curve</div>
                  <h3>Rent Ladder</h3>
                </div>
              </div>
              <div id="pd-rent-tiers" className="gpu-property-tier-grid">
                {tile.type === 'property' && Array.isArray(tile.rentTiers) ? tile.rentTiers.map((amount, index) => <div key={index} className={`gpu-rent-row${tile.houses === index ? ' is-current' : ''}`}><span>{index === 0 ? 'Base Rent' : index === 5 ? 'Hotel' : `${index} House${index > 1 ? 's' : ''}`}</span><strong>{money(amount)}</strong></div>) : tile.type === 'railroad' ? [1, 2, 3, 4].map((count) => <div key={count} className="gpu-rent-row"><span>{count} Railroad{count > 1 ? 's' : ''}</span><strong>{money(getRailroadRent(count))}</strong></div>) : tile.type === 'utility' ? <><div className="gpu-rent-row"><span>1 Utility</span><strong>Dice x4</strong></div><div className="gpu-rent-row"><span>2 Utilities</span><strong>Dice x10</strong></div></> : <div className="gpu-empty-state">No rent data.</div>}
              </div>
            </section>
          </section>
          <aside className="gpu-stack gpu-property-side">
            <section className="gpu-property-section">
              <div className="gpu-property-section-head">
                <div>
                  <div className="gpu-panel-kicker">Build & Bank</div>
                  <h3>Property Economy</h3>
                </div>
              </div>
              <div className="gpu-stack">
                <div className="gpu-stat-box"><span>House Cost</span><strong id="pdm-house-cost">{tile.type === 'property' ? money(Math.floor(tile.price * 0.5)) : '—'}</strong></div>
                <div className="gpu-stat-box"><span>Hotel Cost</span><strong id="pdm-hotel-cost">{tile.type === 'property' ? money(Math.floor(tile.price * 2.5)) : '—'}</strong></div>
                <div className="gpu-stat-box"><span>Mortgage Value</span><strong>{mortgageValue}</strong></div>
              </div>
            </section>
            <section className="gpu-property-section">
              <div className="gpu-property-section-head">
                <div>
                  <div className="gpu-panel-kicker">Actions</div>
                  <h3>Play This Tile</h3>
                </div>
              </div>
              <div id="pd-actions" className="gpu-property-actions">{actionsList.length ? actionsList.map((item) => <button key={item.id} type="button" disabled={item.disabled} title={item.reason} onClick={() => actions.runPropertyAction(item.id, tile.index)}><strong>{item.title}</strong>{item.subtitle ? <span>{item.subtitle}</span> : null}</button>) : <div className="gpu-empty-state">No property actions available.</div>}</div>
            </section>
            <section className="gpu-property-section">
              <div className="gpu-property-section-head">
                <div>
                  <div className="gpu-panel-kicker">Timeline</div>
                  <h3>Recent Activity</h3>
                </div>
              </div>
              <div id="pd-timeline" className="gpu-scroll gpu-stack gpu-property-timeline">{(tile.history || []).length ? [...tile.history].reverse().map((event, index) => <div key={`${event.type}-${index}`} className="gpu-timeline-row"><div className="gpu-grow"><strong style={{ color: event.color }}>{event.character}</strong><div className="gpu-helper-text">{event.type}</div></div>{event.amount ? <strong>{money(event.amount)}</strong> : null}</div>) : <div className="gpu-empty-state">No activity yet.</div>}</div>
            </section>
          </aside>
        </div>
      </div>
    </Modal>
  );
}

function ActionCardModal({ snapshot }) {
  const actionCard = snapshot.ui?.actionCard;
  if (!actionCard) return null;
  return (
    <Modal id="card-modal" translucent>
      <div id="card-inner" className={`gpu-card-flip${actionCard.phase === 'flipped' ? ' is-flipped' : ''}`}>
        <div className="gpu-card-face"><span className="gpu-card-emoji">🃏</span><p>Action Card</p></div>
        <div className="gpu-card-face is-back"><span className="gpu-card-emoji">{actionCard.card?.emoji || '🎲'}</span><p>{actionCard.result?.detailText || actionCard.card?.text}</p>{actionCard.result?.amountLabel ? <strong>{actionCard.result.amountLabel}</strong> : null}</div>
      </div>
    </Modal>
  );
}

function SummaryModal({ snapshot, actions }) {
  const summary = snapshot.ui?.summary;
  if (!summary) return null;
  return (
    <Modal id="summary-modal" onBackdropClick={(event) => { if (event.target.id === 'summary-modal') actions.closeSummary(); }}>
      <div className="gpu-modal-card gpu-summary-card">
        <div className="gpu-inline gpu-space-between"><div><div className="gpu-modal-kicker">Match Summary</div><h2>Performance Snapshot</h2><div className="gpu-helper-text">Quick standings and total net worth.</div></div><button id="summary-close-btn" className="gpu-icon-btn" type="button" onClick={actions.closeSummary}>Close</button></div>
        <div className="gpu-stack">{(summary.placements || []).map((player) => <div key={player.playerId} className={`gpu-summary-row${player.playerId === snapshot.myPlayerId ? ' is-me' : ''}`}><strong>#{player.placement} {player.name || player.character}</strong><span>{money(player.netWorth)} net worth</span></div>)}</div>
      </div>
    </Modal>
  );
}

function EndStats({ snapshot, actions }) {
  const endStats = snapshot.ui?.endStats;
  if (!endStats?.visible || !endStats.summary) return null;
  return (
    <div id="end-stats-screen" className="gpu-end-stats">
      <div className="gpu-end-card">
        <div className="gpu-modal-kicker">Match Complete</div>
        <h1 id="es-winner-title">{endStats.winner?.id === snapshot.myPlayerId ? 'You Win!' : `${endStats.winner?.name || endStats.winner?.character || 'Winner'} Wins!`}</h1>
        <div className="gpu-end-subtitle">Final standings, cash power, and property control.</div>
        <div id="es-player-grid" className="gpu-end-grid">{(endStats.summary.placements || []).map((player) => <article key={player.playerId} className={`gpu-end-player${player.isWinner ? ' is-winner' : ''}`}><strong>{player.name || player.character}</strong><span>#{player.placement}</span><span>{money(player.netWorth)} net worth</span><span>{player.propertiesOwned} properties</span></article>)}</div>
        <div className="gpu-inline gpu-end-actions"><button id="es-return-btn" type="button" className="gpu-hero-btn" onClick={actions.closeEndStats}>Return to Lobby</button></div>
      </div>
    </div>
  );
}

function RotateGate({ snapshot }) {
  if (!snapshot.orientation?.shouldRotate) return null;
  return (
    <div className="gpu-rotate-gate">
      <div className="gpu-rotate-card">
        <div className="gpu-modal-kicker">Landscape Required</div>
        <h2>Rotate your phone to continue the match.</h2>
        <p>Gameplay is built for landscape, tablet, and desktop so the board and controls stay visible.</p>
      </div>
    </div>
  );
}

export function GameplayUI({ snapshot, actions }) {
  if (!snapshot?.visible || !snapshot.gameState) return null;
  const dice = snapshot.ui?.diceResult;
  return (
    <div className={`gpu-shell view-${snapshot.viewMode || 'isometric'}`}>
      <RotateGate snapshot={snapshot} />
      <TopBar snapshot={snapshot} />
      <ViewRail snapshot={snapshot} actions={actions} />
      <div className="gpu-right-rail">
        <Leaderboard snapshot={snapshot} actions={actions} />
      </div>
      <div className="gpu-bottom-left"><ActionDock snapshot={snapshot} actions={actions} /></div>
      <div className="gpu-bottom-right">
        {dice ? <div id="dice-result" className="gpu-dice-result"><span>{dice.playerName || dice.character}</span><span className="gpu-inline"><span>{['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][dice.die1] || '🎲'}</span><span>{['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][dice.die2] || '🎲'}</span></span><strong>= {dice.die1 + dice.die2}{dice.isDoubles ? ' • Doubles' : ''}</strong></div> : null}
        <Feed snapshot={snapshot} actions={actions} />
      </div>
      <HostControls snapshot={snapshot} actions={actions} />
      <BuyModal snapshot={snapshot} actions={actions} />
      <AuctionModal snapshot={snapshot} actions={actions} />
      <OwnAuctionModal snapshot={snapshot} actions={actions} />
      <TradeComposerModal snapshot={snapshot} actions={actions} />
      <TradeIncomingModal snapshot={snapshot} actions={actions} />
      <PropertyModal snapshot={snapshot} actions={actions} />
      <ActionCardModal snapshot={snapshot} />
      <SummaryModal snapshot={snapshot} actions={actions} />
      <EndStats snapshot={snapshot} actions={actions} />
    </div>
  );
}
