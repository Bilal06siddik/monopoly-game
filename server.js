const express = require('express');
const http = require('http');
const path = require('path');
const { randomUUID } = require('crypto');
const { Server } = require('socket.io');

const BOARD_DATA = require('./shared/boardData');
const ACTION_CARDS = require('./shared/actionCards');
const { GameState } = require('./shared/gameState');
const Rules = require('./shared/rules');
const TradeUtils = require('./shared/tradeUtils');
const SummaryUtils = require('./shared/summary');
const CardUtils = require('./shared/cardUtils');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

const CHARACTERS = ['Bilo', 'Os', 'Ziko', 'Maro'];
const CHARACTER_COLORS = {
  Bilo: '#6c5ce7',
  Os: '#e17055',
  Ziko: '#00b894',
  Maro: '#fdcb6e'
};

const TURN_TIMER_SECONDS = 45;
const AUCTION_TIMER_SECONDS = 15;
const DICE_ANIMATION_MS = 1800;
const TOKEN_STEP_MS = 250;
const MOVE_RESOLUTION_BUFFER_MS = 300;
const CARD_MODAL_MS = 4000;
const HISTORY_EVENT_LIMIT = 50;
const BOT_ACTION_MIN_MS = 800;
const BOT_ACTION_MAX_MS = 1800;
const BOT_BID_INCREMENTS = [2, 5, 10, 25, 50, 100];

const lobbyPlayers = new Map();
const pendingTrades = new Map();
const eventHistory = [];
const supersededSocketIds = new Set();
const botActionTimers = new Map();

let gameState = null;
let actionDeck = [];
let auctionState = null;
let auctionTimer = null;
let turnTimerState = null;
let turnTimerInterval = null;
let pausedTurnTimerState = null;
let pendingMoveResolution = null;
let lastDiceTotal = 0;

function normalizeSessionToken(token) {
  const value = typeof token === 'string' ? token.trim() : '';
  return value && value.length <= 200 ? value : randomUUID();
}

function createPlayerId() {
  return `player-${randomUUID()}`;
}

function getPlayerRoom(playerId) {
  return `player:${playerId}`;
}

function pushHistoryEvent(event) {
  eventHistory.push(event);
  while (eventHistory.length > HISTORY_EVENT_LIMIT) {
    eventHistory.shift();
  }
}

function logEvent(text, type = 'info') {
  const event = { text, type, time: Date.now() };
  pushHistoryEvent(event);
  io.emit('history-event', event);
}

function getLobbyEntryBySocketId(socketId) {
  for (const entry of lobbyPlayers.values()) {
    if (entry.socketId === socketId) return entry;
  }
  return null;
}

function getLobbyEntryByCharacter(character) {
  for (const entry of lobbyPlayers.values()) {
    if (entry.character === character) return entry;
  }
  return null;
}

function getAvailableLobbyCharacters() {
  return CHARACTERS.filter(character => !getLobbyEntryByCharacter(character));
}

function getLobbyState() {
  const playerList = [...lobbyPlayers.values()]
    .filter(entry => entry.character)
    .map(entry => ({
      id: entry.playerId,
      name: entry.name,
      character: entry.character,
      isBot: Boolean(entry.isBot)
    }));

  return {
    players: playerList,
    characters: CHARACTERS.map(character => {
      const holder = getLobbyEntryByCharacter(character);
      return {
        name: character,
        taken: Boolean(holder),
        takenBy: holder?.playerId || null,
        takenByBot: Boolean(holder?.isBot),
        takenByName: holder?.name || holder?.character || null
      };
    })
  };
}

function emitLobbyUpdate() {
  io.emit('lobby-update', getLobbyState());
}

function randomBotDelay(min = BOT_ACTION_MIN_MS, max = BOT_ACTION_MAX_MS) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clearBotTimer(key) {
  const timer = botActionTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    botActionTimers.delete(key);
  }
}

function clearBotTimersByPrefix(prefix) {
  for (const [key, timer] of botActionTimers.entries()) {
    if (!key.startsWith(prefix)) continue;
    clearTimeout(timer);
    botActionTimers.delete(key);
  }
}

function clearAllBotTimers() {
  for (const timer of botActionTimers.values()) {
    clearTimeout(timer);
  }
  botActionTimers.clear();
}

function scheduleBotTimer(key, delayMs, callback) {
  clearBotTimer(key);
  const timeoutId = setTimeout(() => {
    botActionTimers.delete(key);
    callback();
  }, delayMs);
  botActionTimers.set(key, timeoutId);
}

function addRandomBotToLobby() {
  const availableCharacters = getAvailableLobbyCharacters();
  if (availableCharacters.length === 0) return null;

  const character = availableCharacters[Math.floor(Math.random() * availableCharacters.length)];
  const entry = {
    sessionToken: `bot-${randomUUID()}`,
    playerId: createPlayerId(),
    socketId: null,
    character,
    name: character,
    isBot: true
  };
  lobbyPlayers.set(entry.sessionToken, entry);
  return entry;
}

function clearLobbyBots() {
  for (const [sessionToken, entry] of lobbyPlayers.entries()) {
    if (!entry.isBot) continue;
    lobbyPlayers.delete(sessionToken);
  }
}

function shuffleActionDeck() {
  actionDeck = [...ACTION_CARDS].sort(() => Math.random() - 0.5);
}

function drawActionCard() {
  if (actionDeck.length === 0) {
    shuffleActionDeck();
  }
  return actionDeck.pop();
}

function isLoopbackAddress(address = '') {
  return address === '::1' || address === '127.0.0.1' || address === '::ffff:127.0.0.1';
}

function isDevSocket(socket) {
  const host = socket.handshake.headers.host || '';
  const referer = socket.handshake.headers.referer || '';
  return process.env.NODE_ENV !== 'production' && (
    isLoopbackAddress(socket.handshake.address) ||
    host === 'localhost' ||
    host.startsWith('localhost:') ||
    host === '127.0.0.1' ||
    host.startsWith('127.0.0.1:') ||
    referer.includes('localhost') ||
    referer.includes('127.0.0.1') ||
    referer.includes('dev=1')
  );
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function syncPlayerPropertyLists() {
  if (!gameState) return;

  gameState.players.forEach(player => {
    player.properties = [];
  });

  gameState.properties.forEach(tile => {
    if (!tile.owner) return;
    const owner = gameState.getPlayerById(tile.owner);
    if (!owner) {
      tile.owner = null;
      tile.houses = 0;
      tile.isMortgaged = false;
      return;
    }
    owner.properties.push(tile.index);
  });
}

function getPurchasableTile(tileIndex) {
  if (!gameState) return null;
  const index = clampInt(tileIndex, 0, gameState.properties.length - 1);
  if (index === null) return null;
  const tile = gameState.properties[index];
  if (!tile || !['property', 'railroad', 'utility'].includes(tile.type)) return null;
  return tile;
}

function emitPlayerSession(socket, player) {
  socket.emit('player-session', {
    sessionToken: socket.data.sessionToken,
    playerId: player?.id || null,
    character: player?.character || null
  });
}

function getViewerTrades(playerId) {
  if (!playerId) return [];
  return [...pendingTrades.values()]
    .filter(trade => trade.toId === playerId)
    .map(trade => ({ ...trade }));
}

function buildGameStatePayload(viewerPlayerId = null) {
  const payload = gameState ? gameState.getState() : {
    players: [],
    properties: [],
    currentPlayerIndex: 0,
    currentPlayerId: null,
    isGameStarted: false,
    turnPhase: 'waiting',
    taxPool: 0,
    turnTimer: null,
    matchStartedAt: null,
    matchEndedAt: null,
    turnCount: 0,
    pauseState: null,
    eliminationOrder: []
  };

  payload.auctionState = auctionState ? { ...auctionState } : null;
  if (viewerPlayerId) {
    payload.pendingTrades = getViewerTrades(viewerPlayerId);
  }
  payload.historyEvents = [...eventHistory];
  return payload;
}

function getSocketPlayer(socket) {
  if (!gameState) return null;
  return gameState.getPlayerBySocketId(socket.id) || gameState.getPlayerBySessionToken(socket.data.sessionToken);
}

function getPlayerSocket(playerId) {
  const player = gameState?.getPlayerById(playerId);
  if (!player?.socketId) return null;
  return io.sockets.sockets.get(player.socketId) || null;
}

function replaceSocketBinding(socket, player) {
  if (!player) return;

  if (player.socketId && player.socketId !== socket.id) {
    supersededSocketIds.add(player.socketId);
    const previousSocket = io.sockets.sockets.get(player.socketId);
    previousSocket?.leave(getPlayerRoom(player.id));
    previousSocket?.disconnect(true);
  }

  player.socketId = socket.id;
  player.isConnected = true;
  player.connectedAt = player.connectedAt || Date.now();
  player.lastSeenAt = Date.now();
  socket.data.playerId = player.id;
  socket.join(getPlayerRoom(player.id));
  emitPlayerSession(socket, player);
}

function createLobbyEntry(socket) {
  const entry = {
    sessionToken: socket.data.sessionToken,
    playerId: createPlayerId(),
    socketId: socket.id,
    character: null,
    name: null
  };
  lobbyPlayers.set(entry.sessionToken, entry);
  return entry;
}

function getOrCreateLobbyEntry(socket) {
  const existing = lobbyPlayers.get(socket.data.sessionToken);
  if (existing) {
    existing.socketId = socket.id;
    socket.data.playerId = existing.playerId;
    return existing;
  }

  const entry = createLobbyEntry(socket);
  socket.data.playerId = entry.playerId;
  return entry;
}
function syncTurnTimerState(timerState) {
  if (gameState) {
    gameState.turnTimer = timerState ? { ...timerState } : null;
  }
}

function removePendingTrade(tradeId, invalidation = null) {
  const trade = pendingTrades.get(tradeId);
  if (!trade) return null;

  pendingTrades.delete(tradeId);

  if (invalidation) {
    io.to(getPlayerRoom(trade.fromId)).emit('trade-invalidated', {
      tradeId,
      code: invalidation.code,
      message: invalidation.message
    });
    io.to(getPlayerRoom(trade.toId)).emit('trade-invalidated', {
      tradeId,
      code: invalidation.code,
      message: invalidation.message
    });
  }

  return trade;
}

function invalidateStaleTrades() {
  if (!gameState) return;

  for (const [tradeId, trade] of pendingTrades.entries()) {
    const validation = TradeUtils.validateTradeOffer(gameState, trade);
    if (!validation.ok) {
      removePendingTrade(tradeId, {
        code: validation.code,
        message: validation.message
      });
    }
  }
}

function removeTradesForPlayer(playerId, reason) {
  for (const [tradeId, trade] of pendingTrades.entries()) {
    if (trade.fromId === playerId || trade.toId === playerId) {
      removePendingTrade(tradeId, reason);
    }
  }
}

function emitGameStateSync({ restartTurnTimer = false, targetSocket = null } = {}) {
  if (!gameState) return;

  syncPlayerPropertyLists();
  invalidateStaleTrades();

  if (restartTurnTimer) {
    clearPendingMoveResolution();
    gameState.doublesCount = 0;
    if (gameState.pauseState) {
      stopTurnTimer(false);
    } else if (gameState.turnPhase === 'waiting' || gameState.turnPhase === 'buying') {
      startTurnTimer(gameState.turnPhase);
    } else {
      stopTurnTimer();
    }
  }

  syncTurnTimerState(turnTimerState);
  syncBotAutomation();

  if (targetSocket) {
    const player = getSocketPlayer(targetSocket);
    targetSocket.emit('game-state-sync', buildGameStatePayload(player?.id || targetSocket.data.playerId || null));
    return;
  }

  io.emit('game-state-sync', buildGameStatePayload());
}

function stopTurnTimer(emitEvent = true) {
  const hadTimer = Boolean(turnTimerState || turnTimerInterval);
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerInterval = null;
  turnTimerState = null;
  syncTurnTimerState(null);
  if (emitEvent && hadTimer) {
    io.emit('turn-timer-stop');
  }
}

function startTurnTimer(phase, remainingSeconds = TURN_TIMER_SECONDS) {
  if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) {
    stopTurnTimer(false);
    return;
  }

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isActive || !['waiting', 'buying'].includes(phase)) {
    stopTurnTimer(false);
    return;
  }

  if (turnTimerInterval) clearInterval(turnTimerInterval);

  turnTimerState = {
    currentPlayerId: currentPlayer.id,
    phase,
    remainingSeconds
  };
  syncTurnTimerState(turnTimerState);
  io.emit('turn-timer-start', gameState.turnTimer);

  turnTimerInterval = setInterval(() => {
    if (!gameState || !gameState.isGameStarted || !turnTimerState || auctionState || gameState.pauseState) {
      stopTurnTimer();
      return;
    }

    const activePlayer = gameState.getCurrentPlayer();
    if (
      !activePlayer ||
      activePlayer.id !== turnTimerState.currentPlayerId ||
      gameState.turnPhase !== turnTimerState.phase
    ) {
      stopTurnTimer();
      return;
    }

    turnTimerState.remainingSeconds--;
    syncTurnTimerState(turnTimerState);
    io.emit('turn-timer-tick', gameState.turnTimer);

    if (turnTimerState.remainingSeconds <= 0) {
      const expiredTimer = { ...turnTimerState };
      stopTurnTimer();
      handleTurnTimeout(expiredTimer);
    }
  }, 1000);
}

function pauseGameForDisconnect(player) {
  if (!gameState || !player) return;

  pausedTurnTimerState = turnTimerState ? { ...turnTimerState } : null;
  stopTurnTimer(false);
  gameState.pauseState = {
    reason: 'player-disconnected',
    playerId: player.id,
    character: player.character,
    pausedAt: Date.now(),
    phase: gameState.turnPhase,
    remainingSeconds: pausedTurnTimerState?.remainingSeconds ?? null
  };
  io.emit('game-paused', {
    pauseState: gameState.pauseState,
    gameState: gameState.getState()
  });
}

function resumePausedGameIfPossible(player) {
  if (!gameState || !gameState.pauseState || !player) return;
  if (gameState.pauseState.reason !== 'player-disconnected') return;
  if (gameState.pauseState.playerId !== player.id) return;

  gameState.pauseState = null;
  const timerToResume = pausedTurnTimerState;
  pausedTurnTimerState = null;

  if (timerToResume && ['waiting', 'buying'].includes(gameState.turnPhase)) {
    startTurnTimer(gameState.turnPhase, timerToResume.remainingSeconds);
  } else {
    stopTurnTimer(false);
  }

  io.emit('game-resumed', { gameState: gameState.getState() });
}

function setTurnPhase(phase, options = {}) {
  if (!gameState) return;

  gameState.turnPhase = phase;
  if (options.resumeTimerSeconds != null) {
    startTurnTimer(phase, options.resumeTimerSeconds);
    return;
  }

  if (['waiting', 'buying'].includes(phase)) {
    startTurnTimer(phase);
  } else {
    stopTurnTimer();
  }
}

function clearPendingMoveResolution() {
  if (pendingMoveResolution?.timeoutId) {
    clearTimeout(pendingMoveResolution.timeoutId);
  }
  pendingMoveResolution = null;
}

function scheduleMoveResolution(playerId, steps, extraDelayMs = 0, resolution = {}) {
  clearPendingMoveResolution();
  const timeoutMs = DICE_ANIMATION_MS + ((steps || 0) * TOKEN_STEP_MS) + MOVE_RESOLUTION_BUFFER_MS + extraDelayMs;
  pendingMoveResolution = {
    playerId,
    resolution,
    timeoutId: setTimeout(() => {
      resolveMoveCompletion(playerId);
    }, timeoutMs)
  };
}

function canPlayerManageAssets(playerId) {
  if (!gameState) return false;

  return Rules.canManageAssets({
    currentPlayerId: gameState.getCurrentPlayer()?.id || null,
    pauseState: gameState.pauseState,
    turnPhase: gameState.turnPhase
  }, playerId);
}

function calculateRent(property, diceTotal, rentContext = {}) {
  return Rules.calculateRent(gameState.properties, property, diceTotal, rentContext);
}

function startAuction(tileIndex, startingBid, initiatorId, options = {}) {
  if (auctionState || !gameState) return;

  const tile = gameState.properties[tileIndex];
  if (!tile) return;

  const reason = options.reason || 'pass';
  const returnPhase = options.returnPhase || 'waiting';
  const returnPlayerId = options.returnPlayerId || gameState.getCurrentPlayer()?.id || null;

  stopTurnTimer(false);
  clearBotTimersByPrefix('turn:');
  clearBotTimersByPrefix('buy:');
  clearBotTimersByPrefix('auction:');

  auctionState = {
    tileIndex,
    tileName: tile.name,
    tileType: tile.type,
    tilePrice: tile.price,
    tileRent: tile.rent,
    tileColorGroup: tile.colorGroup,
    currentBid: Math.max(0, Number.parseInt(startingBid, 10) || 0),
    currentBidderId: null,
    currentBidderCharacter: null,
    timeRemaining: AUCTION_TIMER_SECONDS,
    initiatorId,
    reason,
    returnPhase,
    returnPlayerId
  };

  logEvent(`🔨 Auction started for ${tile.name}!`, 'auction');
  io.emit('auction-started', {
    auction: auctionState,
    players: gameState.players.map(player => player.toJSON()),
    gameState: gameState.getState()
  });
  queueBotAuctionBids();

  auctionTimer = setInterval(() => {
    if (!auctionState) return;
    auctionState.timeRemaining--;
    io.emit('auction-tick', { timeRemaining: auctionState.timeRemaining });
    if (auctionState.timeRemaining <= 0) {
      endAuction();
    }
  }, 1000);
}

function endAuction() {
  if (!auctionState || !gameState) return;

  clearInterval(auctionTimer);
  auctionTimer = null;
  clearBotTimersByPrefix('auction:');

  const finishedAuction = { ...auctionState };
  const tile = gameState.properties[finishedAuction.tileIndex];
  let winner = null;

  if (finishedAuction.currentBidderId) {
    winner = gameState.getPlayerById(finishedAuction.currentBidderId);
    if (winner) {
      winner.money -= finishedAuction.currentBid;
      winner.stats.auctionsWon++;
      tile.owner = winner.id;
      tile.isMortgaged = false;
      if (!winner.properties.includes(tile.index)) {
        winner.properties.push(tile.index);
      }
      logEvent(`🔨 ${winner.character} won ${tile.name} for $${finishedAuction.currentBid}!`, 'auction');
    }
  } else {
    logEvent(`🔨 No bids on ${tile.name}. Property remains unowned.`, 'auction');
  }

  auctionState = null;
  invalidateStaleTrades();

  io.emit('auction-ended', {
    winnerId: winner?.id || null,
    winnerCharacter: winner?.character || null,
    bid: finishedAuction.currentBid,
    tileName: finishedAuction.tileName,
    tileIndex: finishedAuction.tileIndex,
    gameState: gameState.getState()
  });

  if (finishedAuction.reason === 'pass') {
    advanceTurnGlobal();
    return;
  }

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isActive) {
    advanceTurnGlobal();
    return;
  }

  if (finishedAuction.returnPhase === 'buying') {
    setTurnPhase('buying');
    const resumeTile = gameState.properties[currentPlayer.position];
    if (resumeTile?.owner === null) {
      emitBuyPrompt(currentPlayer, resumeTile);
    } else {
      advanceTurnGlobal();
    }
    return;
  }

  setTurnPhase('waiting');
  io.emit('turn-changed', {
    currentPlayerId: currentPlayer.id,
    currentCharacter: currentPlayer.character,
    gameState: gameState.getState()
  });
  queueBotTurnIfNeeded(currentPlayer);
}

function handlePlaceBid(playerId, amountInput) {
  if (!auctionState || !gameState) {
    return { ok: false };
  }

  const playerRecord = gameState.getPlayerById(playerId);
  if (!playerRecord || !playerRecord.isActive) {
    return { ok: false };
  }

  const amount = Number.parseInt(amountInput, 10);
  if (Number.isNaN(amount) || amount <= auctionState.currentBid) {
    return { ok: false };
  }
  if (playerRecord.money < amount) {
    return { ok: false, message: 'You do not have enough cash for that bid.' };
  }

  auctionState.currentBid = amount;
  auctionState.currentBidderId = playerRecord.id;
  auctionState.currentBidderCharacter = playerRecord.character;
  if (auctionState.timeRemaining < 5) {
    auctionState.timeRemaining = 5;
  }

  logEvent(`🔨 ${playerRecord.character} bid $${amount} on ${auctionState.tileName}`, 'bid');
  io.emit('auction-bid', {
    bidderId: playerRecord.id,
    bidderCharacter: playerRecord.character,
    amount,
    timeRemaining: auctionState.timeRemaining,
    auction: auctionState,
    gameState: gameState.getState()
  });
  queueBotAuctionBids();
  return { ok: true };
}

function advanceTurnGlobal() {
  if (!gameState) return;

  clearPendingMoveResolution();
  invalidateStaleTrades();
  setTurnPhase('done');
  gameState.turnCount++;
  const nextPlayer = gameState.nextTurn();
  if (!nextPlayer) return;

  console.log(`✦ Turn passes to ${nextPlayer.character}`);
  setTurnPhase('waiting');
  if (!nextPlayer.isConnected) {
    pauseGameForDisconnect(nextPlayer);
  }
  io.emit('turn-changed', {
    currentPlayerId: nextPlayer.id,
    currentCharacter: nextPlayer.character,
    gameState: gameState.getState()
  });
  queueBotTurnIfNeeded(nextPlayer);
}
function recordMoveStats(player, moveResult) {
  if (!player || !moveResult) return;
  if (moveResult.passedGo) {
    player.stats.goPasses++;
  }
}

function awardPropertyToPlayer(player, tile, price, historyType = 'buy') {
  if (!player || !tile) return;

  tile.owner = player.id;
  tile.isMortgaged = false;
  if (!player.properties.includes(tile.index)) {
    player.properties.push(tile.index);
  }
  tile.addHistory(historyType, player.character, player.color, price);
}

function concludeGame(winner) {
  if (!gameState || gameState.matchEndedAt) return;

  gameState.matchEndedAt = Date.now();
  gameState.pauseState = null;
  pausedTurnTimerState = null;
  clearAllBotTimers();
  stopTurnTimer();

  const summary = SummaryUtils.generateGameSummary(gameState, winner.id);
  logEvent(`🏆 ${winner.character} WINS THE GAME!`, 'win');
  io.emit('game-over', {
    winner: winner.toJSON(),
    summary,
    gameState: gameState.getState()
  });
}

function handleBankruptcy(player) {
  if (!gameState || !player || !player.isActive) return;

  if (pendingMoveResolution?.playerId === player.id) {
    clearPendingMoveResolution();
  }

  player.isActive = false;
  player.money = 0;
  gameState.eliminationOrder.push(player.id);

  const returnedProps = [];
  gameState.properties.forEach(tile => {
    if (tile.owner === player.id) {
      tile.owner = null;
      tile.houses = 0;
      tile.isMortgaged = false;
      returnedProps.push(tile.index);
    }
  });
  player.properties = [];

  removeTradesForPlayer(player.id, {
    code: 'player-bankrupt',
    message: `${player.character} is bankrupt, so the trade can no longer continue.`
  });

  logEvent(`💀 ${player.character} went BANKRUPT!`, 'bankrupt');
  io.emit('player-bankrupt', {
    playerId: player.id,
    character: player.character,
    returnedProperties: returnedProps,
    gameState: gameState.getState()
  });

  const activePlayers = gameState.getActivePlayers();
  if (activePlayers.length === 1) {
    concludeGame(activePlayers[0]);
  }
}

function emitBuyPrompt(player, tile) {
  const socket = getPlayerSocket(player.id);
  if (socket) {
    socket.emit('buy-prompt', {
      playerId: player.id,
      tileIndex: tile.index,
      tileName: tile.name,
      tileType: tile.type,
      price: tile.price,
      colorGroup: tile.colorGroup,
      canAfford: player.money >= tile.price,
      gameState: gameState.getState()
    });
  }
  io.emit('player-deciding', { character: player.character, tileName: tile.name });
  queueBotBuyDecision(player, tile);
}

function resolveActionCardAndMaybeMove(player) {
  const card = drawActionCard();
  player.stats.cardsDrawn++;
  logEvent(`🃏 ${player.character}: "${card.text}"`, 'card');

  const result = CardUtils.resolveActionCard(gameState, player, card);
  if (result.moveResult) {
    recordMoveStats(player, result.moveResult);
  }
  if (result.sentToJail) {
    player.stats.jailVisits++;
  }

  io.emit('card-drawn', {
    playerId: player.id,
    character: player.character,
    card,
    result,
    gameState: gameState.getState()
  });

  const playersBelowZero = gameState.players.filter(currentPlayer => currentPlayer.isActive && currentPlayer.money < 0);
  playersBelowZero.forEach(handleBankruptcy);

  if (!player.isActive) {
    return 'bankrupt';
  }

  if (result.moveResult) {
    setTurnPhase('moving');
    scheduleMoveResolution(
      player.id,
      result.moveResult.steps,
      CARD_MODAL_MS,
      {
        action: result.shouldEvaluateTile ? 'evaluate' : 'advance',
        diceTotal: typeof result.evaluationContext.utilityDiceTotal === 'number'
          ? result.evaluationContext.utilityDiceTotal
          : lastDiceTotal,
        rentContext: result.evaluationContext
      }
    );
    return 'pending';
  }

  return 'done';
}

function evaluateTile(player, diceTotal, rentContext = {}) {
  const tile = gameState.properties[player.position];

  if (player.position === 20) {
    const collected = gameState.taxPool;
    if (collected > 0) {
      gameState.taxPool = 0;
      player.money += collected;
      logEvent(`💰 ${player.character} collected the $${collected} Bailout fund!`, 'buy');
      io.emit('bailout-collected', {
        playerId: player.id,
        character: player.character,
        amount: collected,
        gameState: gameState.getState()
      });
    }
    return 'done';
  }

  if (player.position === 30) {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    player.stats.jailVisits++;
    logEvent(`🚔 ${player.character} was sent to Jail!`, 'tax');
    io.emit('sent-to-jail', {
      playerId: player.id,
      character: player.character,
      gameState: gameState.getState()
    });
    return 'done';
  }

  if (tile.type === 'tax') {
    const taxAmount = tile.rent;
    player.money -= taxAmount;
    gameState.taxPool += taxAmount;
    logEvent(`💸 ${player.character} paid $${taxAmount} in ${tile.name}`, 'tax');
    io.emit('tax-paid', {
      playerId: player.id,
      character: player.character,
      amount: taxAmount,
      tileName: tile.name,
      gameState: gameState.getState()
    });

    invalidateStaleTrades();

    if (player.money < 0) {
      handleBankruptcy(player);
      return 'bankrupt';
    }
    return 'done';
  }

  if (tile.type === 'chance' || tile.type === 'chest') {
    return resolveActionCardAndMaybeMove(player);
  }

  if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
    tile.landedCount++;

    if (tile.owner === null) {
      setTurnPhase('buying');
      emitBuyPrompt(player, tile);
      return 'buying';
    }

    if (tile.owner !== player.id) {
      const rent = calculateRent(tile, diceTotal, rentContext);
      if (rent > 0) {
        const owner = gameState.getPlayerById(tile.owner);
        player.money -= rent;
        owner.money += rent;
        player.stats.rentPaid += rent;
        owner.stats.rentReceived += rent;
        tile.rentCollected += rent;
        tile.addHistory('rent', player.character, player.color, rent);
        logEvent(`💰 ${player.character} paid $${rent} rent to ${owner.character} for ${tile.name}`, 'rent');
        io.emit('rent-paid', {
          payerId: player.id,
          payerCharacter: player.character,
          ownerId: owner.id,
          ownerCharacter: owner.character,
          amount: rent,
          tileName: tile.name,
          gameState: gameState.getState()
        });
      }

      invalidateStaleTrades();

      if (player.money < 0) {
        handleBankruptcy(player);
        return 'bankrupt';
      }
    }

    return 'done';
  }

  return 'done';
}

function resolveMoveCompletion(playerId) {
  if (!gameState || !gameState.isGameStarted) return;

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || currentPlayer.id !== playerId) return;

  const resolution = pendingMoveResolution?.resolution || { action: 'evaluate', diceTotal: lastDiceTotal, rentContext: {} };
  clearPendingMoveResolution();

  if (resolution.action === 'advance') {
    advanceTurnGlobal();
    return;
  }

  const result = evaluateTile(currentPlayer, resolution.diceTotal ?? lastDiceTotal, resolution.rentContext || {});
  if (result === 'buying' || result === 'pending') return;
  if (result === 'bankrupt') {
    if (gameState.getActivePlayers().length > 1) {
      advanceTurnGlobal();
    }
    return;
  }

  advanceTurnGlobal();
}

function handleRollDice(playerId) {
  if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return false;

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || currentPlayer.id !== playerId) return false;
  if (gameState.turnPhase !== 'waiting') return false;

  setTurnPhase('rolling');
  const diceResult = gameState.rollDice();
  lastDiceTotal = diceResult.total;

  if (currentPlayer.inJail) {
    if (diceResult.isDoubles) {
      currentPlayer.inJail = false;
      currentPlayer.jailTurns = 0;
      logEvent(`🔓 ${currentPlayer.character} rolled doubles and escaped jail!`, 'roll');
    } else {
      currentPlayer.jailTurns++;
      if (currentPlayer.jailTurns >= 3) {
        currentPlayer.money -= 50;
        currentPlayer.inJail = false;
        currentPlayer.jailTurns = 0;
        logEvent(`🔓 ${currentPlayer.character} paid $50 to leave jail (3 turns).`, 'tax');
      } else {
        logEvent(`🔒 ${currentPlayer.character} failed to roll doubles (jail turn ${currentPlayer.jailTurns}/3)`, 'roll');
        io.emit('dice-rolled', {
          playerId,
          character: currentPlayer.character,
          die1: diceResult.die1,
          die2: diceResult.die2,
          total: diceResult.total,
          isDoubles: false,
          moveResult: {
            oldPosition: currentPlayer.position,
            newPosition: currentPlayer.position,
            steps: 0,
            passedGo: false
          },
          gameState: gameState.getState(),
          jailRoll: true
        });
        scheduleMoveResolution(playerId, 0, 0, { action: 'evaluate', diceTotal: lastDiceTotal, rentContext: {} });
        return true;
      }
    }
  }

  const moveResult = gameState.movePlayer(playerId, diceResult.total);
  recordMoveStats(currentPlayer, moveResult);
  setTurnPhase('moving');

  logEvent(`🎲 ${currentPlayer.character} rolled ${diceResult.die1} & ${diceResult.die2}${diceResult.isDoubles ? ' (DOUBLES!)' : ''}`, 'roll');

  io.emit('dice-rolled', {
    playerId,
    character: currentPlayer.character,
    die1: diceResult.die1,
    die2: diceResult.die2,
    total: diceResult.total,
    isDoubles: diceResult.isDoubles,
    moveResult: {
      oldPosition: moveResult.oldPosition,
      newPosition: moveResult.newPosition,
      steps: moveResult.steps,
      passedGo: moveResult.passedGo
    },
    gameState: gameState.getState()
  });

  scheduleMoveResolution(playerId, moveResult.steps, 0, { action: 'evaluate', diceTotal: lastDiceTotal, rentContext: {} });
  return true;
}

function handlePassProperty(playerId, { timedOut = false } = {}) {
  if (!gameState || !gameState.isGameStarted || gameState.pauseState) return false;

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || currentPlayer.id !== playerId) return false;
  if (gameState.turnPhase !== 'buying') return false;

  const tile = gameState.properties[currentPlayer.position];
  if (!tile) return false;

  if (timedOut) {
    logEvent(`⏰ ${currentPlayer.character} ran out of time on ${tile.name}. Starting auction.`, 'system');
  } else {
    logEvent(`⏭️ ${currentPlayer.character} passed on ${tile.name}`, 'pass');
  }

  setTurnPhase('auctioning');
  startAuction(currentPlayer.position, 1, currentPlayer.id, {
    reason: 'pass',
    returnPhase: 'waiting'
  });
  return true;
}

function handleBuyProperty(playerId, tileIndex) {
  if (!gameState || !gameState.isGameStarted || gameState.pauseState) return false;

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || currentPlayer.id !== playerId) return false;
  if (gameState.turnPhase !== 'buying') return false;

  const tile = gameState.properties[tileIndex];
  if (!tile || tile.owner !== null || currentPlayer.position !== tile.index) return false;
  if (currentPlayer.money < tile.price) return false;

  currentPlayer.money -= tile.price;
  currentPlayer.stats.propertiesBought++;
  awardPropertyToPlayer(currentPlayer, tile, tile.price, 'buy');
  logEvent(`🏠 ${currentPlayer.character} bought ${tile.name} for $${tile.price}`, 'buy');
  invalidateStaleTrades();

  io.emit('property-bought', {
    playerId: currentPlayer.id,
    character: currentPlayer.character,
    tileIndex: tile.index,
    tileName: tile.name,
    price: tile.price,
    gameState: gameState.getState()
  });
  advanceTurnGlobal();
  return true;
}

function handleTurnTimeout(expiredTimer) {
  if (!gameState || !gameState.isGameStarted || gameState.pauseState) return;

  const currentPlayer = gameState.getCurrentPlayer();
  if (
    !currentPlayer ||
    currentPlayer.id !== expiredTimer.currentPlayerId ||
    gameState.turnPhase !== expiredTimer.phase
  ) {
    return;
  }

  if (expiredTimer.phase === 'waiting') {
    logEvent(`⏰ ${currentPlayer.character} ran out of time. Auto-rolling.`, 'system');
    handleRollDice(currentPlayer.id);
    return;
  }

  if (expiredTimer.phase === 'buying') {
    handlePassProperty(currentPlayer.id, { timedOut: true });
  }
}

function wouldOwnFullColorGroup(playerId, tile) {
  if (!gameState || !tile || tile.type !== 'property' || !tile.colorGroup) return false;

  return gameState.properties
    .filter(groupTile => groupTile.type === 'property' && groupTile.colorGroup === tile.colorGroup)
    .every(groupTile => groupTile.index === tile.index || groupTile.owner === playerId);
}

function shouldBotBuyProperty(player, tile) {
  if (!gameState || !player || !tile || player.money < tile.price) return false;

  const remainingCash = player.money - tile.price;
  let chance = tile.type === 'railroad' ? 0.74 : tile.type === 'utility' ? 0.62 : 0.68;

  if (wouldOwnFullColorGroup(player.id, tile)) {
    chance += 0.18;
  }

  if (tile.type === 'property' && tile.colorGroup) {
    const ownedInGroup = gameState.properties.filter(groupTile =>
      groupTile.type === 'property'
      && groupTile.colorGroup === tile.colorGroup
      && groupTile.owner === player.id
    ).length;
    chance += ownedInGroup * 0.08;
  }

  if (remainingCash < 150) {
    chance -= 0.38;
  } else if (remainingCash < 300) {
    chance -= 0.18;
  }

  chance = Math.max(0.12, Math.min(0.95, chance));
  return Math.random() < chance;
}

function getBotBidCap(player, tile) {
  if (!player || !tile) return 0;

  const reserve = player.money >= 900 ? 180 : player.money >= 500 ? 120 : 60;
  let cap = tile.price + Math.floor(tile.price * 0.2);

  if (tile.type === 'railroad') cap += 40;
  if (tile.type === 'utility') cap += 20;
  if (wouldOwnFullColorGroup(player.id, tile)) cap += 90;

  cap = Math.min(cap, player.money - Math.min(reserve, Math.floor(player.money * 0.3)));
  return Math.max(0, Math.min(player.money, cap));
}

function queueBotTurnIfNeeded(player = gameState?.getCurrentPlayer()) {
  clearBotTimersByPrefix('turn:');

  if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return;
  if (!player?.isBot || !player.isActive) return;
  if (gameState.getCurrentPlayer()?.id !== player.id) return;
  if (gameState.turnPhase !== 'waiting') return;

  scheduleBotTimer(`turn:${player.id}`, randomBotDelay(), () => {
    if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return;
    const currentPlayer = gameState.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== player.id || !currentPlayer.isBot || gameState.turnPhase !== 'waiting') return;
    handleRollDice(currentPlayer.id);
  });
}

function queueBotBuyDecision(player, tile) {
  clearBotTimersByPrefix('buy:');

  if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return;
  if (!player?.isBot || !player.isActive || gameState.turnPhase !== 'buying') return;
  if (gameState.getCurrentPlayer()?.id !== player.id || tile?.owner !== null) return;

  scheduleBotTimer(`buy:${player.id}`, randomBotDelay(), () => {
    if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return;

    const currentPlayer = gameState.getCurrentPlayer();
    const liveTile = currentPlayer ? gameState.properties[currentPlayer.position] : null;
    if (!currentPlayer || currentPlayer.id !== player.id || !currentPlayer.isBot || gameState.turnPhase !== 'buying') return;
    if (!liveTile || liveTile.owner !== null) return;

    if (shouldBotBuyProperty(currentPlayer, liveTile)) {
      handleBuyProperty(currentPlayer.id, liveTile.index);
      return;
    }

    handlePassProperty(currentPlayer.id);
  });
}

function queueBotAuctionBids() {
  clearBotTimersByPrefix('auction:');

  if (!gameState || !auctionState || gameState.pauseState) return;

  const tile = gameState.properties[auctionState.tileIndex];
  if (!tile) return;

  gameState.players
    .filter(player => player.isBot && player.isActive)
    .forEach(player => {
      if (auctionState.currentBidderId === player.id) return;

      scheduleBotTimer(`auction:${player.id}`, randomBotDelay(700, 1500), () => {
        if (!gameState || !auctionState || gameState.pauseState) return;

        const livePlayer = gameState.getPlayerById(player.id);
        const liveTile = gameState.properties[auctionState.tileIndex];
        if (!livePlayer || !livePlayer.isBot || !livePlayer.isActive || !liveTile) return;
        if (auctionState.currentBidderId === livePlayer.id) return;

        const maxBid = getBotBidCap(livePlayer, liveTile);
        const possibleBids = BOT_BID_INCREMENTS
          .map(increment => auctionState.currentBid + increment)
          .filter(amount => amount <= maxBid && amount <= livePlayer.money);

        if (possibleBids.length === 0) return;

        const bidChance = liveTile.type === 'property' ? 0.72 : 0.64;
        if (Math.random() > bidChance) return;

        const choicePool = possibleBids.slice(0, Math.min(possibleBids.length, 3));
        const bid = choicePool[Math.floor(Math.random() * choicePool.length)];
        handlePlaceBid(livePlayer.id, bid);
      });
    });
}

function syncBotAutomation() {
  clearBotTimersByPrefix('turn:');
  clearBotTimersByPrefix('buy:');

  if (!gameState || !gameState.isGameStarted || gameState.pauseState || gameState.matchEndedAt) {
    clearBotTimersByPrefix('auction:');
    return;
  }

  if (auctionState) {
    queueBotAuctionBids();
    return;
  }

  clearBotTimersByPrefix('auction:');

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isBot || !currentPlayer.isActive) return;

  if (gameState.turnPhase === 'waiting') {
    queueBotTurnIfNeeded(currentPlayer);
    return;
  }

  if (gameState.turnPhase === 'buying') {
    const tile = gameState.properties[currentPlayer.position];
    if (tile?.owner === null) {
      queueBotBuyDecision(currentPlayer, tile);
    }
  }
}

io.on('connection', socket => {
  socket.data.sessionToken = normalizeSessionToken(socket.handshake.auth?.sessionToken);
  console.log(`✦ Player connected: ${socket.id}`);

  const player = gameState?.getPlayerBySessionToken(socket.data.sessionToken) || null;
  if (player) {
    replaceSocketBinding(socket, player);
    resumePausedGameIfPossible(player);
    emitGameStateSync();
  } else {
    const lobbyEntry = getOrCreateLobbyEntry(socket);
    emitPlayerSession(socket, gameState?.getPlayerById(lobbyEntry.playerId) || null);
  }

  socket.emit('lobby-update', getLobbyState());
  if (gameState && gameState.isGameStarted) {
    emitGameStateSync({ targetSocket: socket });
  }

  socket.on('select-character', characterName => {
    if (gameState && gameState.isGameStarted) {
      socket.emit('character-error', { message: 'Game already in progress' });
      return;
    }
    if (!CHARACTERS.includes(characterName)) {
      socket.emit('character-error', { message: 'Invalid character' });
      return;
    }

    const currentEntry = getOrCreateLobbyEntry(socket);
    const holder = getLobbyEntryByCharacter(characterName);
    if (holder && holder.sessionToken !== currentEntry.sessionToken) {
      socket.emit('character-taken', { character: characterName, message: 'Character already taken' });
      return;
    }

    currentEntry.character = characterName;
    currentEntry.name = characterName;
    currentEntry.socketId = socket.id;
    socket.data.playerId = currentEntry.playerId;
    socket.emit('character-confirmed', { character: characterName });
    emitPlayerSession(socket, { id: currentEntry.playerId, character: characterName });
    emitLobbyUpdate();
  });

  socket.on('deselect-character', () => {
    const entry = getLobbyEntryBySocketId(socket.id);
    if (!entry) return;
    entry.character = null;
    entry.name = null;
    emitLobbyUpdate();
  });

  socket.on('add-random-bot', () => {
    if (gameState && gameState.isGameStarted) {
      socket.emit('game-error', { message: 'Add bots before starting the game.' });
      return;
    }

    const botEntry = addRandomBotToLobby();
    if (!botEntry) {
      socket.emit('game-error', { message: 'All characters are already taken.' });
      return;
    }

    emitLobbyUpdate();
  });

  socket.on('clear-lobby-bots', () => {
    if (gameState && gameState.isGameStarted) {
      socket.emit('game-error', { message: 'You can only clear bots from the lobby.' });
      return;
    }

    clearLobbyBots();
    emitLobbyUpdate();
  });

  socket.on('requestStartGame', () => {
    const readyPlayers = [...lobbyPlayers.values()].filter(entry => entry.character);
    if (readyPlayers.length < 2) {
      socket.emit('game-error', { message: 'Need at least 2 players to start' });
      return;
    }
    if (gameState && gameState.isGameStarted) {
      socket.emit('game-error', { message: 'Game is already running' });
      return;
    }

    gameState = new GameState(BOARD_DATA);
    shuffleActionDeck();
    pendingTrades.clear();
    eventHistory.length = 0;
    pausedTurnTimerState = null;
    clearPendingMoveResolution();
    clearAllBotTimers();
    auctionState = null;
    if (auctionTimer) {
      clearInterval(auctionTimer);
      auctionTimer = null;
    }

    readyPlayers.forEach(entry => {
      const playerRecord = gameState.addPlayer(
        entry.playerId,
        entry.character,
        CHARACTER_COLORS[entry.character],
        entry.isBot ? null : entry.sessionToken,
        { isBot: Boolean(entry.isBot), isConnected: entry.isBot ? true : Boolean(entry.socketId) }
      );
      playerRecord.socketId = entry.socketId;
      playerRecord.isConnected = entry.isBot ? true : Boolean(entry.socketId);
      playerRecord.connectedAt = Date.now();
      playerRecord.lastSeenAt = Date.now();
    });

    gameState.isGameStarted = true;
    gameState.matchStartedAt = Date.now();
    gameState.matchEndedAt = null;
    gameState.turnCount = 0;
    gameState.pauseState = null;
    gameState.eliminationOrder = [];

    setTurnPhase('waiting');

    gameState.players.forEach(currentPlayer => {
      const targetSocket = getPlayerSocket(currentPlayer.id);
      if (targetSocket) {
        replaceSocketBinding(targetSocket, currentPlayer);
      }
    });

    console.log(`\n  🎮 Game started with ${readyPlayers.length} players!\n`);
    logEvent(`🎮 Game started with ${readyPlayers.length} players!`, 'system');
    io.emit('gameStarted', buildGameStatePayload());
    queueBotTurnIfNeeded(gameState.getCurrentPlayer());
  });

  socket.on('roll-dice', () => {
    if (!gameState || !gameState.isGameStarted) return;
    if (auctionState) {
      socket.emit('game-error', { message: 'Auction in progress' });
      return;
    }
    const playerRecord = getSocketPlayer(socket);
    handleRollDice(playerRecord?.id);
  });

  socket.on('move-complete', () => {
    if (!gameState || !gameState.isGameStarted) return;
    const currentPlayer = gameState.getCurrentPlayer();
    const playerRecord = getSocketPlayer(socket);
    if (!currentPlayer || !playerRecord || currentPlayer.id !== playerRecord.id) return;
    resolveMoveCompletion(playerRecord.id);
  });

  socket.on('buy-property', data => {
    const playerRecord = getSocketPlayer(socket);
    handleBuyProperty(playerRecord?.id, data.tileIndex);
  });

  socket.on('buy-out-jail', () => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord || !playerRecord.inJail) return;
    if (playerRecord.money < 50) {
      socket.emit('game-error', { message: 'Not enough money to buy out of jail ($50)' });
      return;
    }

    playerRecord.money -= 50;
    gameState.taxPool += 50;
    playerRecord.inJail = false;
    playerRecord.jailTurns = 0;
    logEvent(`🔓 ${playerRecord.character} paid $50 to leave jail!`, 'tax');
    invalidateStaleTrades();

    io.emit('jail-state-changed', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      inJail: false,
      gameState: gameState.getState()
    });
  });

  socket.on('use-pardon', () => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord || !playerRecord.inJail || playerRecord.pardons <= 0) return;

    playerRecord.pardons--;
    playerRecord.inJail = false;
    playerRecord.jailTurns = 0;
    logEvent(`🃏 ${playerRecord.character} used a Pardon Card to leave jail!`, 'card');

    io.emit('jail-state-changed', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      inJail: false,
      gameState: gameState.getState()
    });
  });

  socket.on('pass-property', () => {
    const playerRecord = getSocketPlayer(socket);
    handlePassProperty(playerRecord?.id);
  });

  socket.on('dev-command', (data = {}) => {
    if (!isDevSocket(socket)) {
      socket.emit('game-error', { message: 'Developer tools are only available from localhost.' });
      return;
    }
    if (!gameState || !gameState.isGameStarted) {
      socket.emit('game-error', { message: 'Start a game before using developer tools.' });
      return;
    }
    if (auctionState) {
      socket.emit('game-error', { message: 'Finish the current auction before using developer tools.' });
      return;
    }
    if (gameState.turnPhase === 'rolling' || gameState.turnPhase === 'moving') {
      socket.emit('game-error', { message: 'Wait for movement to finish before using developer tools.' });
      return;
    }

    let restartTurnTimer = false;

    switch (data.type) {
      case 'set-money': {
        const playerRecord = gameState.getPlayerById(data.playerId);
        const amount = Number.parseInt(data.amount, 10);
        if (!playerRecord || Number.isNaN(amount)) {
          socket.emit('game-error', { message: 'Invalid player or money value.' });
          return;
        }

        playerRecord.money = amount;
        logEvent(`🛠️ DEV set ${playerRecord.character}'s cash to $${amount}.`, 'system');
        break;
      }

      case 'set-current-turn': {
        const playerIndex = gameState.players.findIndex(playerRecord => playerRecord.id === data.playerId);
        if (playerIndex < 0 || !gameState.players[playerIndex].isActive) {
          socket.emit('game-error', { message: 'Choose an active player for the turn.' });
          return;
        }

        gameState.currentPlayerIndex = playerIndex;
        gameState.turnPhase = 'waiting';
        restartTurnTimer = true;
        logEvent(`🛠️ DEV handed the turn to ${gameState.players[playerIndex].character}.`, 'system');
        break;
      }

      case 'set-position': {
        const playerRecord = gameState.getPlayerById(data.playerId);
        const tileIndex = clampInt(data.tileIndex, 0, gameState.properties.length - 1);
        if (!playerRecord || tileIndex === null) {
          socket.emit('game-error', { message: 'Invalid player or tile selection.' });
          return;
        }

        playerRecord.position = tileIndex;
        if (playerRecord.inJail && tileIndex !== 10) {
          playerRecord.inJail = false;
          playerRecord.jailTurns = 0;
        }

        if (gameState.getCurrentPlayer()?.id === playerRecord.id) {
          gameState.turnPhase = 'waiting';
          restartTurnTimer = true;
        }

        logEvent(`🛠️ DEV moved ${playerRecord.character} to ${gameState.properties[tileIndex].name}.`, 'system');
        break;
      }

      case 'set-owner': {
        const playerRecord = gameState.getPlayerById(data.playerId);
        const tile = getPurchasableTile(data.tileIndex);
        if (!playerRecord || !tile) {
          socket.emit('game-error', { message: 'Choose a player and a purchasable tile.' });
          return;
        }

        tile.owner = playerRecord.id;
        if (gameState.turnPhase === 'buying') {
          gameState.turnPhase = 'waiting';
          restartTurnTimer = true;
        }

        logEvent(`🛠️ DEV gave ${tile.name} to ${playerRecord.character}.`, 'system');
        break;
      }

      case 'clear-owner': {
        const tile = getPurchasableTile(data.tileIndex);
        if (!tile) {
          socket.emit('game-error', { message: 'Choose a purchasable tile to reset.' });
          return;
        }

        tile.owner = null;
        tile.houses = 0;
        tile.isMortgaged = false;
        if (gameState.turnPhase === 'buying') {
          gameState.turnPhase = 'waiting';
          restartTurnTimer = true;
        }

        logEvent(`🛠️ DEV returned ${tile.name} to the bank.`, 'system');
        break;
      }

      case 'set-houses': {
        const tile = getPurchasableTile(data.tileIndex);
        const houses = clampInt(data.houses, 0, 5);
        if (!tile || tile.type !== 'property' || houses === null) {
          socket.emit('game-error', { message: 'Choose a street property and a building level from 0 to 5.' });
          return;
        }
        if (!tile.owner && houses > 0) {
          socket.emit('game-error', { message: 'Give the property an owner before adding buildings.' });
          return;
        }

        tile.houses = houses;
        if (houses > 0) tile.isMortgaged = false;
        if (gameState.turnPhase === 'buying') {
          gameState.turnPhase = 'waiting';
          restartTurnTimer = true;
        }

        logEvent(`🛠️ DEV set ${tile.name} to ${houses >= 5 ? 'a hotel' : `${houses} building(s)`}.`, 'system');
        break;
      }

      case 'toggle-mortgage': {
        const tile = getPurchasableTile(data.tileIndex);
        if (!tile || !tile.owner) {
          socket.emit('game-error', { message: 'Choose an owned purchasable tile to mortgage.' });
          return;
        }

        tile.isMortgaged = !tile.isMortgaged;
        if (tile.isMortgaged) tile.houses = 0;
        if (gameState.turnPhase === 'buying') {
          gameState.turnPhase = 'waiting';
          restartTurnTimer = true;
        }

        logEvent(`🛠️ DEV ${tile.isMortgaged ? 'mortgaged' : 'unmortgaged'} ${tile.name}.`, 'system');
        break;
      }

      case 'claim-color-group': {
        const playerRecord = gameState.getPlayerById(data.playerId);
        const groupTiles = gameState.properties.filter(tile => tile.colorGroup === data.colorGroup);
        if (!playerRecord || !groupTiles.length) {
          socket.emit('game-error', { message: 'Choose a player and a valid group.' });
          return;
        }

        groupTiles.forEach(tile => {
          tile.owner = playerRecord.id;
          tile.isMortgaged = false;
        });
        if (gameState.turnPhase === 'buying') {
          gameState.turnPhase = 'waiting';
          restartTurnTimer = true;
        }

        logEvent(`🛠️ DEV gave the ${data.colorGroup} group to ${playerRecord.character}.`, 'system');
        break;
      }

      case 'toggle-jail': {
        const playerRecord = gameState.getPlayerById(data.playerId);
        if (!playerRecord || !playerRecord.isActive) {
          socket.emit('game-error', { message: 'Choose an active player to edit jail status.' });
          return;
        }

        playerRecord.inJail = !playerRecord.inJail;
        playerRecord.jailTurns = 0;
        if (playerRecord.inJail) playerRecord.position = 10;

        if (gameState.getCurrentPlayer()?.id === playerRecord.id) {
          gameState.turnPhase = 'waiting';
          restartTurnTimer = true;
        }

        logEvent(`🛠️ DEV ${playerRecord.inJail ? 'sent' : 'released'} ${playerRecord.character} ${playerRecord.inJail ? 'to' : 'from'} jail.`, 'system');
        break;
      }

      default:
        socket.emit('game-error', { message: 'Unknown developer command.' });
        return;
    }

    emitGameStateSync({ restartTurnTimer });
  });

  socket.on('own-auction', data => {
    if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord || !canPlayerManageAssets(playerRecord.id)) {
      socket.emit('game-error', { message: 'Only the active player can start an own auction right now.' });
      return;
    }

    const returnPhase = gameState.turnPhase;
    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== playerRecord.id) return;
    if (Rules.isGroupAssetLocked(gameState.properties, tile)) {
      socket.emit('game-error', { message: Rules.getGroupAssetLockMessage(tile, 'starting an auction') });
      return;
    }

    tile.owner = null;
    playerRecord.properties = playerRecord.properties.filter(index => index !== data.tileIndex);

    logEvent(`🔨 ${playerRecord.character} put ${tile.name} up for auction!`, 'auction');
    setTurnPhase('auctioning');
    startAuction(data.tileIndex, Math.floor(tile.price / 2), playerRecord.id, {
      reason: 'own',
      returnPhase,
      returnPlayerId: playerRecord.id
    });
  });

  socket.on('place-bid', data => {
    const playerRecord = getSocketPlayer(socket);
    const result = handlePlaceBid(playerRecord?.id, data.amount);
    if (!result.ok && result.message) {
      socket.emit('game-error', { message: result.message });
    }
  });

  socket.on('trade-offer', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const from = getSocketPlayer(socket);
    if (!from) return;

    const validation = TradeUtils.validateTradeOffer(gameState, {
      ...data,
      fromId: from.id,
      toId: data.targetId || data.toId
    });

    if (!validation.ok) {
      socket.emit('trade-validation', validation);
      socket.emit('game-error', { message: validation.message });
      return;
    }

    const tradeId = `trade-${randomUUID()}`;
    const trade = {
      ...validation.value,
      id: tradeId,
      createdAt: Date.now(),
      isCounterOffer: Boolean(validation.value.counterToTradeId)
    };

    if (trade.counterToTradeId) {
      removePendingTrade(trade.counterToTradeId, {
        code: 'countered',
        message: `${from.character} replaced the original offer with a counter-offer.`
      });
    }

    pendingTrades.set(tradeId, trade);
    logEvent(`🤝 ${from.character} offered a trade to ${trade.toCharacter}`, 'trade');
    io.to(getPlayerRoom(trade.toId)).emit('trade-incoming', trade);
    socket.emit('trade-sent', {
      trade,
      replacedTradeId: trade.counterToTradeId || null
    });
  });

  socket.on('trade-accept', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const accepter = getSocketPlayer(socket);
    if (!accepter) return;

    const trade = pendingTrades.get(data.tradeId);
    if (!trade || trade.toId !== accepter.id) {
      socket.emit('trade-validation', {
        ok: false,
        code: 'missing-trade',
        message: 'That trade offer is no longer available.'
      });
      return;
    }

    const validation = TradeUtils.validateTradeOffer(gameState, trade);
    if (!validation.ok) {
      removePendingTrade(trade.id, {
        code: validation.code,
        message: validation.message
      });
      socket.emit('trade-validation', validation);
      return;
    }

    const offerer = gameState.getPlayerById(trade.fromId);
    if (!offerer) return;

    offerer.money -= trade.offerCash;
    offerer.money += trade.requestCash;
    accepter.money += trade.offerCash;
    accepter.money -= trade.requestCash;

    trade.offerProperties.forEach(index => {
      const tile = gameState.properties[index];
      if (!tile || tile.owner !== trade.fromId) return;
      tile.owner = accepter.id;
      tile.addHistory('trade', accepter.character, accepter.color, 0);
    });
    trade.requestProperties.forEach(index => {
      const tile = gameState.properties[index];
      if (!tile || tile.owner !== accepter.id) return;
      tile.owner = offerer.id;
      tile.addHistory('trade', offerer.character, offerer.color, 0);
    });

    offerer.stats.tradesCompleted++;
    accepter.stats.tradesCompleted++;
    syncPlayerPropertyLists();
    removePendingTrade(trade.id);
    invalidateStaleTrades();

    logEvent(`✅ ${accepter.character} accepted trade with ${offerer.character}!`, 'trade');
    io.emit('trade-completed', {
      tradeId: trade.id,
      fromId: offerer.id,
      toId: accepter.id,
      fromCharacter: offerer.character,
      toCharacter: accepter.character,
      gameState: gameState.getState()
    });
  });

  socket.on('trade-reject', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const rejecter = getSocketPlayer(socket);
    if (!rejecter) return;

    const trade = pendingTrades.get(data.tradeId);
    if (!trade || trade.toId !== rejecter.id) return;

    removePendingTrade(trade.id);
    const offerer = gameState.getPlayerById(trade.fromId);
    if (offerer) {
      logEvent(`❌ ${rejecter.character} rejected trade from ${offerer.character}`, 'trade');
      io.to(getPlayerRoom(offerer.id)).emit('trade-rejected', {
        tradeId: trade.id,
        fromId: offerer.id,
        toId: rejecter.id
      });
    }
  });

  socket.on('upgrade-property', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord) return;
    if (!canPlayerManageAssets(playerRecord.id)) {
      socket.emit('game-error', { message: 'Only the active player can build right now.' });
      return;
    }

    const validation = Rules.validateUpgrade(gameState.properties, playerRecord.id, data.tileIndex);
    if (!validation.ok) {
      socket.emit('game-error', { message: validation.message });
      return;
    }

    const tile = validation.tile;
    const upgradeCost = Math.floor(tile.price * 0.5);
    if (playerRecord.money < upgradeCost) {
      socket.emit('game-error', { message: `Need $${upgradeCost} to upgrade.` });
      return;
    }

    playerRecord.money -= upgradeCost;
    playerRecord.stats.housesBuilt++;
    tile.houses++;
    const label = tile.houses >= 5 ? 'Hotel' : `House ${tile.houses}`;
    logEvent(`🏗️ ${playerRecord.character} built ${label} on ${tile.name} ($${upgradeCost})`, 'buy');
    invalidateStaleTrades();

    io.emit('property-upgraded', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      houses: tile.houses,
      cost: upgradeCost,
      gameState: gameState.getState()
    });
  });

  socket.on('downgrade-property', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord) return;
    if (!canPlayerManageAssets(playerRecord.id)) {
      socket.emit('game-error', { message: 'Only the active player can sell buildings right now.' });
      return;
    }

    const validation = Rules.validateDowngrade(gameState.properties, playerRecord.id, data.tileIndex);
    if (!validation.ok) {
      socket.emit('game-error', { message: validation.message });
      return;
    }

    const tile = validation.tile;
    const refund = Math.floor(tile.price * 0.25);
    playerRecord.money += refund;
    playerRecord.stats.housesSold++;
    tile.houses--;
    logEvent(`🔻 ${playerRecord.character} sold a house on ${tile.name} (+$${refund})`, 'sell');
    invalidateStaleTrades();

    io.emit('property-downgraded', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      houses: tile.houses,
      refund,
      gameState: gameState.getState()
    });
  });

  socket.on('mortgage-property', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord) return;
    if (!canPlayerManageAssets(playerRecord.id)) {
      socket.emit('game-error', { message: 'Only the active player can mortgage property right now.' });
      return;
    }

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== playerRecord.id) return;
    if (tile.isMortgaged) return;
    if (Rules.isGroupAssetLocked(gameState.properties, tile)) {
      socket.emit('game-error', { message: Rules.getGroupAssetLockMessage(tile, 'mortgaging') });
      return;
    }

    tile.isMortgaged = true;
    const mortgageValue = Math.floor(tile.price / 2);
    playerRecord.money += mortgageValue;
    logEvent(`🏦 ${playerRecord.character} mortgaged ${tile.name} (+$${mortgageValue})`, 'sell');
    invalidateStaleTrades();

    io.emit('property-mortgaged', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      mortgageValue,
      gameState: gameState.getState()
    });
  });

  socket.on('unmortgage-property', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord) return;
    if (!canPlayerManageAssets(playerRecord.id)) {
      socket.emit('game-error', { message: 'Only the active player can unmortgage property right now.' });
      return;
    }

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== playerRecord.id) return;
    if (!tile.isMortgaged) return;

    const unmortgageCost = Math.floor(tile.price * 0.55);
    if (playerRecord.money < unmortgageCost) {
      socket.emit('game-error', { message: `Need $${unmortgageCost} to unmortgage.` });
      return;
    }

    tile.isMortgaged = false;
    playerRecord.money -= unmortgageCost;
    logEvent(`🏦 ${playerRecord.character} unmortgaged ${tile.name} (-$${unmortgageCost})`, 'buy');
    invalidateStaleTrades();

    io.emit('property-unmortgaged', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      cost: unmortgageCost,
      gameState: gameState.getState()
    });
  });

  socket.on('sell-property', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord) return;
    if (!canPlayerManageAssets(playerRecord.id)) {
      socket.emit('game-error', { message: 'Only the active player can sell property right now.' });
      return;
    }

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== playerRecord.id) return;
    if (Rules.isGroupAssetLocked(gameState.properties, tile)) {
      socket.emit('game-error', { message: Rules.getGroupAssetLockMessage(tile, 'selling') });
      return;
    }

    const sellValue = Math.floor(tile.price * 0.5) + ((tile.houses || 0) * Math.floor(tile.price * 0.25));
    playerRecord.money += sellValue;
    tile.owner = null;
    tile.houses = 0;
    tile.isMortgaged = false;
    playerRecord.properties = playerRecord.properties.filter(index => index !== data.tileIndex);
    logEvent(`💰 ${playerRecord.character} sold ${tile.name} to the bank (+$${sellValue})`, 'sell');
    invalidateStaleTrades();

    io.emit('property-sold', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      sellValue,
      gameState: gameState.getState()
    });
  });

  socket.on('disconnect', () => {
    if (supersededSocketIds.delete(socket.id)) {
      return;
    }

    const lobbyEntry = getLobbyEntryBySocketId(socket.id);
    if (lobbyEntry && !(gameState && gameState.isGameStarted)) {
      lobbyPlayers.delete(lobbyEntry.sessionToken);
      emitLobbyUpdate();
    }

    if (!gameState || !gameState.isGameStarted) {
      return;
    }

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord) return;

    playerRecord.isConnected = false;
    playerRecord.lastSeenAt = Date.now();
    if (playerRecord.socketId === socket.id) {
      playerRecord.socketId = null;
    }

    logEvent(`🚪 ${playerRecord.character} disconnected`, 'system');

    const isCurrentPlayer = gameState.getCurrentPlayer()?.id === playerRecord.id;
    if (isCurrentPlayer && ['waiting', 'buying'].includes(gameState.turnPhase)) {
      pauseGameForDisconnect(playerRecord);
    }

    emitGameStateSync();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🎲 Monopoly server running at http://localhost:${PORT}\n`);
});
