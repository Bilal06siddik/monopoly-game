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
const {
  TOKEN_OPTIONS,
  normalizeTokenId,
  getDefaultTokenForCharacter
} = require('./shared/tokenCatalog');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const UPGRADE_MODEL_FILES = new Set([
  'small_buildingB.glb',
  'small_buildingA.glb',
  'large_buildingD.glb',
  'skyscraperE.glb',
  'skyscraperB.glb'
]);

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));
app.get('/models/:file', (req, res) => {
  const file = typeof req.params.file === 'string' ? req.params.file.trim() : '';
  if (!UPGRADE_MODEL_FILES.has(file)) {
    res.sendStatus(404);
    return;
  }
  res.sendFile(path.join(__dirname, file));
});

const CHARACTERS = ['bilo', 'osss', 'bdlbaky', 'fawzy', 'hamza', 'missiry'];
const CHARACTER_COLORS = {
  bilo:     '#8e44ad', // Deep Purple
  osss:     '#f1c40f', // Gold
  bdlbaky:  '#2ecc71', // Emerald Green
  fawzy:    '#e74c3c', // Crimson Red
  hamza:    '#3498db', // Ocean Blue
  missiry:  '#e61a8d'  // Hot Pink
};

const TURN_TIMER_SECONDS = 60;
const AUCTION_TIMER_SECONDS = 10;
const AUCTION_BID_RESET_SECONDS = 5;
const DICE_ANIMATION_MS = 1800;
const TOKEN_STEP_MS = 250;
const MOVE_RESOLUTION_BUFFER_MS = 300;
const CARD_MODAL_MS = 4000;
const HISTORY_EVENT_LIMIT = 50;
const BOT_ACTION_MIN_MS = 800;
const BOT_ACTION_MAX_MS = 1800;
const BOT_BID_INCREMENTS = [2, 5, 10, 25, 50, 100];
const SAVE_FILE_VERSION = 1;

const supersededSocketIds = new Set();
const rooms = new Map();
let currentRoomCode = null;
let lobbyPlayers = null;
let pendingTrades = null;
let eventHistory = null;
let botActionTimers = null;
let gameState = null;
let actionDeck = null;
let auctionState = null;
let auctionTimer = null;
let turnTimerState = null;
let turnTimerInterval = null;
let pausedTurnTimerState = null;
let pendingMoveResolution = null;
let lastDiceTotal = null;

function normalizeSessionToken(token) {
  const value = typeof token === 'string' ? token.trim() : '';
  return value && value.length <= 200 ? value : randomUUID();
}

function createPlayerId() {
  return `player-${randomUUID()}`;
}

function normalizeRoomCode(code) {
  const value = typeof code === 'string' ? code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  return value && value.length <= 12 ? value : '';
}

function getSocketRoom(roomCode = currentRoomCode) {
  return roomCode ? `room:${roomCode}` : null;
}

function getPlayerRoom(playerId) {
  return currentRoomCode ? `room:${currentRoomCode}:player:${playerId}` : `player:${playerId}`;
}

function createRoomState(roomCode, hostSessionToken) {
  return {
    code: roomCode,
    hostSessionToken,
    createdAt: Date.now(),
    endedAt: null,
    kickedSessionTokens: new Set(),
    lobbyPlayers: new Map(),
    pendingTrades: new Map(),
    eventHistory: [],
    botActionTimers: new Map(),
    gameState: null,
    actionDeck: [],
    auctionState: null,
    auctionTimer: null,
    turnTimerState: null,
    turnTimerInterval: null,
    pausedTurnTimerState: null,
    pendingMoveResolution: null,
    lastDiceTotal: 0
  };
}

function assignRoomState(roomState) {
  currentRoomCode = roomState?.code || null;
  lobbyPlayers = roomState?.lobbyPlayers || null;
  pendingTrades = roomState?.pendingTrades || null;
  eventHistory = roomState?.eventHistory || null;
  botActionTimers = roomState?.botActionTimers || null;
  gameState = roomState?.gameState || null;
  actionDeck = roomState?.actionDeck || null;
  auctionState = roomState?.auctionState || null;
  auctionTimer = roomState?.auctionTimer || null;
  turnTimerState = roomState?.turnTimerState || null;
  turnTimerInterval = roomState?.turnTimerInterval || null;
  pausedTurnTimerState = roomState?.pausedTurnTimerState || null;
  pendingMoveResolution = roomState?.pendingMoveResolution || null;
  lastDiceTotal = roomState?.lastDiceTotal ?? null;
}

function persistRoomState(roomState) {
  if (!roomState) return;
  roomState.lobbyPlayers = lobbyPlayers;
  roomState.pendingTrades = pendingTrades;
  roomState.eventHistory = eventHistory;
  roomState.botActionTimers = botActionTimers;
  roomState.gameState = gameState;
  roomState.actionDeck = actionDeck;
  roomState.auctionState = auctionState;
  roomState.auctionTimer = auctionTimer;
  roomState.turnTimerState = turnTimerState;
  roomState.turnTimerInterval = turnTimerInterval;
  roomState.pausedTurnTimerState = pausedTurnTimerState;
  roomState.pendingMoveResolution = pendingMoveResolution;
  roomState.lastDiceTotal = lastDiceTotal;
}

function withRoomState(roomState, callback) {
  const previous = {
    currentRoomCode,
    lobbyPlayers,
    pendingTrades,
    eventHistory,
    botActionTimers,
    gameState,
    actionDeck,
    auctionState,
    auctionTimer,
    turnTimerState,
    turnTimerInterval,
    pausedTurnTimerState,
    pendingMoveResolution,
    lastDiceTotal
  };

  assignRoomState(roomState);
  try {
    return callback();
  } finally {
    persistRoomState(roomState);
    currentRoomCode = previous.currentRoomCode;
    lobbyPlayers = previous.lobbyPlayers;
    pendingTrades = previous.pendingTrades;
    eventHistory = previous.eventHistory;
    botActionTimers = previous.botActionTimers;
    gameState = previous.gameState;
    actionDeck = previous.actionDeck;
    auctionState = previous.auctionState;
    auctionTimer = previous.auctionTimer;
    turnTimerState = previous.turnTimerState;
    turnTimerInterval = previous.turnTimerInterval;
    pausedTurnTimerState = previous.pausedTurnTimerState;
    pendingMoveResolution = previous.pendingMoveResolution;
    lastDiceTotal = previous.lastDiceTotal;
  }
}

function getOrCreateRoomState(roomCode, hostSessionToken = null) {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  if (!normalizedRoomCode) return null;
  let roomState = rooms.get(normalizedRoomCode);
  if (!roomState) {
    roomState = createRoomState(normalizedRoomCode, hostSessionToken);
    rooms.set(normalizedRoomCode, roomState);
  } else if (!roomState.hostSessionToken && hostSessionToken) {
    roomState.hostSessionToken = hostSessionToken;
  }
  if (!roomState.kickedSessionTokens) {
    roomState.kickedSessionTokens = new Set();
  }
  return roomState;
}

function emitToRoom(eventName, payload) {
  const roomName = getSocketRoom();
  if (!roomName) return;
  io.to(roomName).emit(eventName, payload);
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
  emitToRoom('history-event', event);
}

function formatCurrency(amount) {
  return `$${Math.abs(Math.round(amount || 0))}`;
}

function logPlayerMoneyDelta(player, delta, reason, type = 'info') {
  if (!player || !delta) return;
  const direction = delta > 0 ? 'received' : 'paid';
  logEvent(`💵 ${player.character} ${direction} ${formatCurrency(delta)} ${reason}`, type);
}

function snapshotPlayerMoney() {
  if (!gameState) return new Map();
  return new Map(gameState.players.map(player => [player.id, player.money]));
}

function logMoneyDeltasSince(snapshot, reasonByDelta, type = 'info') {
  if (!gameState || !(snapshot instanceof Map)) return;

  gameState.players.forEach(player => {
    const before = snapshot.get(player.id);
    if (typeof before !== 'number') return;
    const delta = player.money - before;
    if (!delta) return;
    const reason = typeof reasonByDelta === 'function' ? reasonByDelta(player, delta) : reasonByDelta;
    logPlayerMoneyDelta(player, delta, reason, type);
  });
}

function describeTradeCashForPlayer(player, trade, counterpart) {
  if (!player || !trade || !counterpart) return '';

  if (player.id === trade.fromId) {
    const gave = trade.offerCash;
    const received = trade.requestCash;
    if (gave > 0 && received > 0) {
      return `in cash trade with ${counterpart.character} (gave $${gave}, received $${received})`;
    }
    if (gave > 0) {
      return `to ${counterpart.character} in trade`;
    }
    if (received > 0) {
      return `from ${counterpart.character} in trade`;
    }
    return '';
  }

  const gave = trade.requestCash;
  const received = trade.offerCash;
  if (gave > 0 && received > 0) {
    return `in cash trade with ${counterpart.character} (gave $${gave}, received $${received})`;
  }
  if (gave > 0) {
    return `to ${counterpart.character} in trade`;
  }
  if (received > 0) {
    return `from ${counterpart.character} in trade`;
  }
  return '';
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

function getLobbyEntryByPlayerId(playerId) {
  for (const entry of lobbyPlayers.values()) {
    if (entry.playerId === playerId) return entry;
  }
  return null;
}

function getAvailableLobbyCharacters() {
  return CHARACTERS.filter(character => !getLobbyEntryByCharacter(character));
}

function resolveLobbyToken(character, preferredTokenId = null) {
  return normalizeTokenId(preferredTokenId) || getDefaultTokenForCharacter(character);
}

function normalizeCustomColor(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : null;
}

function getLobbyState() {
  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
  const playerList = [...lobbyPlayers.values()]
    .filter(entry => entry.character)
    .map(entry => ({
      id: entry.playerId,
      name: entry.name,
      character: entry.character,
      tokenId: entry.tokenId || null,
      isBot: Boolean(entry.isBot)
    }));

  return {
    roomCode: currentRoomCode,
    joinUrl: currentRoomCode ? `/?room=${currentRoomCode}` : null,
    hostPlayerId: roomState?.hostSessionToken
      ? (gameState?.getPlayerBySessionToken(roomState.hostSessionToken)?.id
        || lobbyPlayers.get(roomState.hostSessionToken)?.playerId
        || null)
      : null,
    players: playerList,
    members: [...lobbyPlayers.values()].map(entry => ({
      playerId: entry.playerId,
      name: entry.name || null,
      character: entry.character || null,
      tokenId: entry.tokenId || null,
      isBot: Boolean(entry.isBot),
      isOnline: Boolean(entry.isBot || entry.socketId),
      isHost: Boolean(roomState?.hostSessionToken && entry.sessionToken === roomState.hostSessionToken)
    })),
    characters: CHARACTERS.map(character => {
      const holder = getLobbyEntryByCharacter(character);
      return {
        name: character,
        taken: Boolean(holder),
        takenBy: holder?.playerId || null,
        offline: Boolean(holder?.character && !holder?.isBot && !holder?.socketId),
        takenByBot: Boolean(holder?.isBot),
        takenByName: holder?.name || holder?.character || null
      };
    }),
    tokens: TOKEN_OPTIONS.map(token => ({
      id: token.id,
      label: token.label
    }))
  };
}

function emitLobbyUpdate() {
  emitToRoom('lobby-update', getLobbyState());
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
  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
  const timeoutId = setTimeout(() => {
    withRoomState(roomState, () => {
      botActionTimers.delete(key);
      callback();
    });
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
    tokenId: resolveLobbyToken(character),
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
    character: player?.character || null,
    tokenId: player?.tokenId || null,
    customColor: player?.customColor || null
  });
}

function getViewerTrades(playerId) {
  if (!playerId) return [];
  return [...pendingTrades.values()]
    .filter(trade => trade.toId === playerId || trade.fromId === playerId)
    .map(trade => ({ ...trade }));
}

function buildGameStatePayload(viewerPlayerId = null) {
  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
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
  payload.roomCode = currentRoomCode;
  payload.joinUrl = currentRoomCode ? `/?room=${currentRoomCode}` : null;
  payload.hostPlayerId = roomState?.hostSessionToken
    ? (gameState?.getPlayerBySessionToken(roomState.hostSessionToken)?.id
      || lobbyPlayers.get(roomState.hostSessionToken)?.playerId
      || null)
    : null;
  return payload;
}

function buildSavePayload() {
  if (!gameState) return null;

  return {
    version: SAVE_FILE_VERSION,
    savedAt: Date.now(),
    roomCode: currentRoomCode,
    actionDeck: Array.isArray(actionDeck) ? [...actionDeck] : [],
    eventHistory: Array.isArray(eventHistory) ? [...eventHistory] : [],
    lastDiceTotal: Number.isFinite(lastDiceTotal) ? lastDiceTotal : 0,
    turnTimerState: turnTimerState ? { ...turnTimerState } : null,
    gameState: {
      currentPlayerIndex: gameState.currentPlayerIndex,
      isGameStarted: gameState.isGameStarted,
      doublesCount: gameState.doublesCount,
      turnPhase: gameState.turnPhase,
      taxPool: gameState.taxPool,
      matchStartedAt: gameState.matchStartedAt,
      matchEndedAt: gameState.matchEndedAt,
      turnCount: gameState.turnCount,
      pauseState: gameState.pauseState,
      eliminationOrder: [...gameState.eliminationOrder],
      players: gameState.players.map(player => ({
        id: player.id,
        character: player.character,
        color: player.color,
        tokenId: player.tokenId,
        sessionToken: player.sessionToken,
        position: player.position,
        money: player.money,
        properties: [...player.properties],
        inJail: Boolean(player.inJail),
        jailTurns: player.jailTurns,
        pardons: player.pardons,
        isActive: Boolean(player.isActive),
        isBot: Boolean(player.isBot),
        stats: { ...player.stats },
        bankruptcyDeadline: player.bankruptcyDeadline
      })),
      properties: gameState.properties.map(property => ({
        index: property.index,
        owner: property.owner,
        houses: property.houses,
        isMortgaged: Boolean(property.isMortgaged),
        landedCount: property.landedCount,
        rentCollected: property.rentCollected,
        history: Array.isArray(property.history) ? [...property.history] : []
      }))
    }
  };
}

function restoreGameStateFromSave(saveState) {
  const payload = saveState?.gameState && Array.isArray(saveState.gameState.players)
    ? saveState.gameState
    : saveState;

  if (!payload || !Array.isArray(payload.players) || !Array.isArray(payload.properties)) {
    throw new Error('Invalid save file format.');
  }

  const restored = new GameState(BOARD_DATA);
  restored.players = [];

  payload.players.forEach((playerData, index) => {
    const lobbyEntry = playerData.sessionToken
      ? lobbyPlayers.get(playerData.sessionToken)
      : getLobbyEntryByPlayerId(playerData.id) || getLobbyEntryByCharacter(playerData.character);

    const restoredPlayer = restored.addPlayer(
      playerData.id || lobbyEntry?.playerId || createPlayerId(),
      playerData.character || lobbyEntry?.character || lobbyEntry?.name || `Player ${index + 1}`,
      playerData.color || CHARACTER_COLORS[playerData.character] || '#9aa4b2',
      playerData.isBot ? null : (playerData.sessionToken || lobbyEntry?.sessionToken || null),
      {
        isBot: Boolean(playerData.isBot),
        isConnected: Boolean(playerData.isBot || lobbyEntry?.socketId),
        tokenId: resolveLobbyToken(playerData.character || lobbyEntry?.character, playerData.tokenId)
      }
    );

    restoredPlayer.socketId = lobbyEntry?.socketId || null;
    restoredPlayer.position = clampInt(playerData.position, 0, BOARD_DATA.length - 1) ?? 0;
    restoredPlayer.money = Number.isFinite(playerData.money) ? playerData.money : 1500;
    restoredPlayer.properties = Array.isArray(playerData.properties) ? [...playerData.properties] : [];
    restoredPlayer.inJail = Boolean(playerData.inJail);
    restoredPlayer.jailTurns = clampInt(playerData.jailTurns, 0, 3) ?? 0;
    restoredPlayer.pardons = Math.max(0, Number.parseInt(playerData.pardons, 10) || 0);
    restoredPlayer.isActive = playerData.isActive !== false;
    restoredPlayer.connectedAt = lobbyEntry?.socketId ? Date.now() : restoredPlayer.connectedAt;
    restoredPlayer.lastSeenAt = Date.now();
    Object.assign(restoredPlayer.stats, playerData.stats || {});

    restoredPlayer.bankruptcyDeadline = playerData.bankruptcyDeadline != null ? Date.now() : null;
  });

  restored.properties.forEach(property => {
    const savedProperty = payload.properties.find(entry => entry.index === property.index);
    if (!savedProperty) return;
    property.owner = restored.getPlayerById(savedProperty.owner)?.id || null;
    property.houses = clampInt(savedProperty.houses, 0, 5) ?? 0;
    property.isMortgaged = Boolean(savedProperty.isMortgaged);
    property.landedCount = Math.max(0, Number.parseInt(savedProperty.landedCount, 10) || 0);
    property.rentCollected = Math.max(0, Number.parseInt(savedProperty.rentCollected, 10) || 0);
    property.history = Array.isArray(savedProperty.history) ? [...savedProperty.history].slice(-20) : [];
  });

  restored.currentPlayerIndex = clampInt(payload.currentPlayerIndex, 0, Math.max(restored.players.length - 1, 0)) ?? 0;
  restored.isGameStarted = payload.isGameStarted !== false;
  restored.doublesCount = clampInt(payload.doublesCount, 0, 2) ?? 0;
  restored.turnPhase = ['waiting', 'buying', 'done'].includes(payload.turnPhase)
    ? payload.turnPhase
    : 'waiting';
  restored.taxPool = Math.max(0, Number.parseInt(payload.taxPool, 10) || 0);
  restored.matchStartedAt = payload.matchStartedAt || Date.now();
  restored.matchEndedAt = payload.matchEndedAt || null;
  restored.turnCount = Math.max(0, Number.parseInt(payload.turnCount, 10) || 0);
  restored.pauseState = null;
  restored.eliminationOrder = Array.isArray(payload.eliminationOrder) ? [...payload.eliminationOrder] : [];

  if (!restored.getCurrentPlayer()?.isActive) {
    const nextActiveIndex = restored.players.findIndex(player => player.isActive);
    restored.currentPlayerIndex = nextActiveIndex >= 0 ? nextActiveIndex : 0;
  }

  return {
    restoredGameState: restored,
    restoredActionDeck: Array.isArray(saveState?.actionDeck) ? [...saveState.actionDeck] : [...ACTION_CARDS],
    restoredEventHistory: Array.isArray(saveState?.eventHistory) ? [...saveState.eventHistory] : [],
    restoredLastDiceTotal: Number.isFinite(saveState?.lastDiceTotal) ? saveState.lastDiceTotal : 0,
    restoredTurnTimerState: saveState?.turnTimerState ? { ...saveState.turnTimerState } : null
  };
}

function clearRoomGameRuntime({ preserveLobby = true } = {}) {
  clearPendingMoveResolution();
  clearAllBotTimers();
  stopTurnTimer(false);
  if (auctionTimer) {
    clearInterval(auctionTimer);
    auctionTimer = null;
  }

  gameState = null;
  actionDeck = [];
  auctionState = null;
  pausedTurnTimerState = null;
  pendingMoveResolution = null;
  lastDiceTotal = 0;
  pendingTrades.clear();
  eventHistory.length = 0;

  if (!preserveLobby) {
    lobbyPlayers.clear();
  }
}

function endGameForRoom(roomState, endedByCharacter = null) {
  let ended = false;

  withRoomState(roomState, () => {
    if (!gameState || !gameState.isGameStarted) return;

    ended = true;
    clearRoomGameRuntime({ preserveLobby: true });

    emitToRoom('game-ended-by-host', {
      roomCode: roomState.code,
      endedBy: endedByCharacter,
      message: endedByCharacter
        ? `${endedByCharacter} ended the current match. You're back in the lobby.`
        : 'The host ended the current match. You are back in the lobby.'
    });
    emitLobbyUpdate();
    emitToRoom('game-state-sync', buildGameStatePayload());
  });

  return ended;
}

function kickPlayerFromRoom(roomState, targetPlayerId, removedByCharacter = 'The host') {
  let result = { ok: false, message: 'Player not found.' };
  let targetSocket = null;

  withRoomState(roomState, () => {
    const lobbyEntry = getLobbyEntryByPlayerId(targetPlayerId);
    const player = gameState?.getPlayerById(targetPlayerId) || null;
    const sessionToken = lobbyEntry?.sessionToken || player?.sessionToken || null;
    const targetCharacter = player?.character || lobbyEntry?.character || lobbyEntry?.name || 'That player';

    if (!lobbyEntry && !player) {
      result = { ok: false, message: 'Player not found.' };
      return;
    }

    if (sessionToken && roomState.hostSessionToken === sessionToken) {
      result = { ok: false, message: 'The host cannot be kicked.' };
      return;
    }

    if (gameState?.isGameStarted && (auctionState || ['rolling', 'moving'].includes(gameState.turnPhase))) {
      result = { ok: false, message: 'Wait for the current move or auction to finish before kicking a player.' };
      return;
    }

    if (player?.socketId) {
      targetSocket = io.sockets.sockets.get(player.socketId) || null;
    } else if (lobbyEntry?.socketId) {
      targetSocket = io.sockets.sockets.get(lobbyEntry.socketId) || null;
    }

    if (sessionToken) {
      roomState.kickedSessionTokens.add(sessionToken);
    }

    if (lobbyEntry) {
      lobbyPlayers.delete(lobbyEntry.sessionToken);
    }

    if (player) {
      if (pendingMoveResolution?.playerId === player.id) {
        clearPendingMoveResolution();
      }

      player.isActive = false;
      player.isConnected = false;
      player.money = 0;
      player.inJail = false;
      player.jailTurns = 0;
      player.socketId = null;
      player.sessionToken = null;
      if (!gameState.eliminationOrder.includes(player.id)) {
        gameState.eliminationOrder.push(player.id);
      }

      gameState.properties.forEach(tile => {
        if (tile.owner !== player.id) return;
        tile.owner = null;
        tile.houses = 0;
        tile.isMortgaged = false;
      });
      player.properties = [];

      removeTradesForPlayer(player.id, {
        code: 'player-kicked',
        message: `${targetCharacter} was removed by the host, so this trade can no longer continue.`
      });

      if (gameState.pauseState?.playerId === player.id) {
        gameState.pauseState = null;
        pausedTurnTimerState = null;
      }

      logEvent(`🚫 ${removedByCharacter} removed ${targetCharacter} from the match.`, 'system');

      const activePlayers = gameState.getActivePlayers();
      if (activePlayers.length === 1) {
        concludeGame(activePlayers[0]);
      } else if (gameState.getCurrentPlayer()?.id === player.id) {
        advanceTurnGlobal();
      } else {
        emitGameStateSync();
      }
    }

    emitLobbyUpdate();
    result = {
      ok: true,
      playerId: targetPlayerId,
      character: targetCharacter
    };
  });

  if (result.ok && targetSocket) {
    targetSocket.emit('player-kicked', {
      roomCode: roomState.code,
      message: `${removedByCharacter} removed you from room ${roomState.code}.`
    });
    targetSocket.disconnect(true);
  }

  return result;
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
    tokenId: null,
    name: null
  };
  lobbyPlayers.set(entry.sessionToken, entry);
  return entry;
}

function getOrCreateLobbyEntry(socket) {
    const existing = lobbyPlayers.get(socket.data.sessionToken);
  if (existing) {
    existing.socketId = socket.id;
    if (existing.character && !existing.tokenId) {
      existing.tokenId = resolveLobbyToken(existing.character);
    }
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

  clearBotTimer(`trade:${tradeId}`);
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
  gameState.players.forEach(checkBankruptcyRecovery);
  invalidateStaleTrades();

  if (restartTurnTimer) {
    clearPendingMoveResolution();
    gameState.doublesCount = 0;
    if (gameState.pauseState) {
      stopTurnTimer(false);
    } else if (
      ['waiting', 'buying', 'done'].includes(gameState.turnPhase)
      && !gameState.getCurrentPlayer()?.bankruptcyDeadline
    ) {
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

  emitToRoom('game-state-sync', buildGameStatePayload());
}

function stopTurnTimer(emitEvent = true) {
  const hadTimer = Boolean(turnTimerState || turnTimerInterval);
  if (turnTimerInterval) clearInterval(turnTimerInterval);
  turnTimerInterval = null;
  turnTimerState = null;
  syncTurnTimerState(null);
  if (emitEvent && hadTimer) {
    emitToRoom('turn-timer-stop');
  }
}

function startTurnTimer(phase, remainingSeconds = TURN_TIMER_SECONDS) {
  if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) {
    stopTurnTimer(false);
    return;
  }

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isActive || !['waiting', 'buying', 'done'].includes(phase)) {
    stopTurnTimer(false);
    return;
  }
  if (currentPlayer.bankruptcyDeadline) {
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
  emitToRoom('turn-timer-start', gameState.turnTimer);

  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
  turnTimerInterval = setInterval(() => withRoomState(roomState, () => {
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
    emitToRoom('turn-timer-tick', gameState.turnTimer);

    if (turnTimerState.remainingSeconds <= 0) {
      const expiredTimer = { ...turnTimerState };
      stopTurnTimer();
      handleTurnTimeout(expiredTimer);
    }
  }), 1000);
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
  emitToRoom('game-paused', {
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

  if (timerToResume && ['waiting', 'buying', 'done'].includes(gameState.turnPhase)) {
    startTurnTimer(gameState.turnPhase, timerToResume.remainingSeconds);
  } else {
    stopTurnTimer(false);
  }

  emitToRoom('game-resumed', { gameState: gameState.getState() });
}

function setTurnPhase(phase, options = {}) {
  if (!gameState) return;

  gameState.turnPhase = phase;
  if (options.restartTimer === false) {
    stopTurnTimer(options.emitTimerStop !== false);
    return;
  }
  if (options.resumeTimerSeconds != null) {
    startTurnTimer(phase, options.resumeTimerSeconds);
    return;
  }

  if (['waiting', 'buying', 'done'].includes(phase)) {
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
  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
  pendingMoveResolution = {
    playerId,
    resolution,
    timeoutId: setTimeout(() => withRoomState(roomState, () => {
      resolveMoveCompletion(playerId);
    }), timeoutMs)
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
  const bidResetSeconds = Math.max(1, Number.parseInt(options.bidResetSeconds, 10) || AUCTION_BID_RESET_SECONDS);

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
    timerMaxSeconds: AUCTION_TIMER_SECONDS,
    bidResetSeconds,
    initiatorId,
    reason,
    returnPhase,
    returnPlayerId
  };

  logEvent(`🔨 Auction started for ${tile.name}!`, 'auction');
  emitToRoom('auction-started', {
    auction: auctionState,
    players: gameState.players.map(player => player.toJSON()),
    gameState: gameState.getState()
  });
  queueBotAuctionBids();

  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
  auctionTimer = setInterval(() => withRoomState(roomState, () => {
    if (!auctionState) return;
    auctionState.timeRemaining--;
    emitToRoom('auction-tick', { timeRemaining: auctionState.timeRemaining });
    if (auctionState.timeRemaining <= 0) {
      endAuction();
    }
  }), 1000);
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
      // #5: Own auction proceeds go to the seller
      if (finishedAuction.reason === 'own' && finishedAuction.initiatorId) {
        const seller = gameState.getPlayerById(finishedAuction.initiatorId);
        if (seller && seller.id !== winner.id) {
          seller.money += finishedAuction.currentBid;
          checkBankruptcyRecovery(seller);
          logEvent(`💰 ${seller.character} received $${finishedAuction.currentBid} from the auction of ${tile.name}`, 'buy');
        }
      }
      logEvent(`🔨 ${winner.character} won ${tile.name} for $${finishedAuction.currentBid}!`, 'auction');
    }
  } else {
    logEvent(`🔨 No bids on ${tile.name}. Property remains unowned.`, 'auction');
  }

  auctionState = null;
  invalidateStaleTrades();

  emitToRoom('auction-ended', {
    winnerId: winner?.id || null,
    winnerCharacter: winner?.character || null,
    bid: finishedAuction.currentBid,
    tileName: finishedAuction.tileName,
    tileIndex: finishedAuction.tileIndex,
    gameState: gameState.getState()
  });

  if (finishedAuction.reason === 'pass') {
    waitForTurnEndCurrentPlayer();
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
  emitToRoom('turn-changed', {
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
  auctionState.timeRemaining = auctionState.bidResetSeconds || AUCTION_BID_RESET_SECONDS;
  auctionState.timerMaxSeconds = auctionState.bidResetSeconds || AUCTION_BID_RESET_SECONDS;

  logEvent(`🔨 ${playerRecord.character} bid $${amount} on ${auctionState.tileName}`, 'bid');
  emitToRoom('auction-bid', {
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
  emitToRoom('turn-changed', {
    currentPlayerId: nextPlayer.id,
    currentCharacter: nextPlayer.character,
    gameState: gameState.getState()
  });
  queueBotTurnIfNeeded(nextPlayer);
}

function waitForTurnEndCurrentPlayer() {
  if (!gameState) return;

  clearPendingMoveResolution();
  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isActive) {
    advanceTurnGlobal();
    return;
  }

  setTurnPhase('done');
  if (!currentPlayer.isConnected) {
    pauseGameForDisconnect(currentPlayer);
  }
  emitToRoom('turn-changed', {
    currentPlayerId: currentPlayer.id,
    currentCharacter: currentPlayer.character,
    gameState: gameState.getState()
  });
  queueBotEndTurnIfNeeded(currentPlayer);
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

  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
  gameState.matchEndedAt = Date.now();
  gameState.pauseState = null;
  pausedTurnTimerState = null;
  clearAllBotTimers();
  stopTurnTimer();

  const summary = SummaryUtils.generateGameSummary(gameState, winner.id);
  logEvent(`🏆 ${winner.character} WINS THE GAME!`, 'win');
  emitToRoom('game-over', {
    winner: winner.toJSON(),
    summary,
    gameState: gameState.getState()
  });

  clearRoomGameRuntime({ preserveLobby: true });
  emitLobbyUpdate();
  emitToRoom('game-state-sync', buildGameStatePayload());
  persistRoomState(roomState);
}

function handleBankruptcy(player) {
  if (!gameState || !player || !player.isActive) return 'ignored';

  const ownedTiles = gameState.properties.filter(t => t.owner === player.id);
  const hasAssets = ownedTiles.some(t => t.houses > 0 || !t.isMortgaged);
  const alreadyInRecovery = Boolean(player.bankruptcyDeadline);

  if (!hasAssets) {
    executeBankruptcy(player);
    return 'eliminated';
  }

  if (!player.bankruptcyDeadline) {
    player.bankruptcyDeadline = Date.now();
  }

  if (gameState.getCurrentPlayer()?.id === player.id) {
    setTurnPhase('waiting', { restartTimer: false });
  }

  if (!alreadyInRecovery) {
    logEvent(`⚠️ ${player.character} is in debt ($${player.money})! Recover before ending the turn or declare bankruptcy.`, 'bankrupt');
  }
  emitToRoom('bankruptcy-warning', {
    playerId: player.id,
    character: player.character,
    money: player.money,
    gameState: gameState.getState()
  });

  emitGameStateSync({ restartTurnTimer: false });
  return 'warning';
}

function checkBankruptcyRecovery(player) {
  if (!player?.bankruptcyDeadline || !player.isActive) return;

  if (player.money >= 0) {
    player.bankruptcyDeadline = null;

    logEvent(`✅ ${player.character} recovered from debt!`, 'system');
    emitToRoom('bankruptcy-resolved', {
      playerId: player.id,
      character: player.character,
      survived: true,
      gameState: gameState.getState()
    });
  }
}

function executeBankruptcy(player) {
  if (!gameState || !player || !player.isActive) return;

  if (pendingMoveResolution?.playerId === player.id) {
    clearPendingMoveResolution();
  }

  player.bankruptcyDeadline = null;

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
  emitToRoom('player-bankrupt', {
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
  emitToRoom('player-deciding', { character: player.character, tileName: tile.name });
  queueBotBuyDecision(player, tile);
}

function resolveActionCardAndMaybeMove(player) {
  // #27: Lucky Wheel removes 'roll again' doubles bonus
  if (lastDiceTotal && lastDiceTotal.isDoubles) {
      lastDiceTotal.isDoubles = false;
      player.doublesCount = 0;
  }
  const card = drawActionCard();
  player.stats.cardsDrawn++;
  logEvent(`🃏 ${player.character}: "${card.text}"`, 'card');

  const moneySnapshot = snapshotPlayerMoney();
  const result = CardUtils.resolveActionCard(gameState, player, card);
  logMoneyDeltasSince(
    moneySnapshot,
    currentPlayer => `from action card "${card.text}"`,
    'card'
  );
  if (result.moveResult) {
    recordMoveStats(player, result.moveResult);
  }
  if (result.sentToJail) {
    player.stats.jailVisits++;
  }

  emitToRoom('card-drawn', {
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
  if (player.bankruptcyDeadline) {
    return 'recovery';
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
      logPlayerMoneyDelta(player, collected, 'from the Bailout fund', 'buy');
  emitToRoom('bailout-collected', {
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
  emitToRoom('sent-to-jail', {
      playerId: player.id,
      character: player.character,
      gameState: gameState.getState()
    });
    return 'done';
  }

  if (tile.type === 'tax') {
    const taxAmount = Rules.calculateTaxAmount(tile, player);
    player.money -= taxAmount;
    gameState.taxPool += taxAmount;
    logEvent(`💸 ${player.character} paid $${taxAmount} in ${tile.name}`, 'tax');
  emitToRoom('tax-paid', {
      playerId: player.id,
      character: player.character,
      amount: taxAmount,
      tileName: tile.name,
      gameState: gameState.getState()
    });

    invalidateStaleTrades();

    if (player.money < 0) {
      return handleBankruptcy(player) === 'eliminated' ? 'bankrupt' : 'recovery';
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
  emitToRoom('rent-paid', {
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
        return handleBankruptcy(player) === 'eliminated' ? 'bankrupt' : 'recovery';
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

  if (resolution.action === 'finish-turn') {
    waitForTurnEndCurrentPlayer();
    return;
  }

  const result = evaluateTile(currentPlayer, resolution.diceTotal ?? lastDiceTotal, resolution.rentContext || {});
  if (result === 'buying' || result === 'pending' || result === 'recovery') return;
  if (result === 'bankrupt') {
    if (gameState.getActivePlayers().length > 1) {
      advanceTurnGlobal();
    }
    return;
  }

  waitForTurnEndCurrentPlayer();
}

function handleRollDice(playerId) {
  if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return false;

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || currentPlayer.id !== playerId) return false;
  // #12: Safeguard — only allow rolling when in 'waiting' phase
  if (gameState.turnPhase !== 'waiting') return false;
  if (currentPlayer.bankruptcyDeadline || currentPlayer.money < 0) return false;

  setTurnPhase('rolling');
  const diceResult = gameState.rollDice();
  lastDiceTotal = diceResult.total;

  if (currentPlayer.inJail) {
    if (diceResult.isDoubles) {
      currentPlayer.inJail = false;
      currentPlayer.jailTurns = 0;
      logEvent(`🔓 ${currentPlayer.character} rolled doubles and escaped jail!`, 'roll');
      // #7: Escaping jail by rolling doubles ends the turn (no move this turn)
      emitToRoom('dice-rolled', {
        playerId,
        character: currentPlayer.character,
        die1: diceResult.die1,
        die2: diceResult.die2,
        total: diceResult.total,
        isDoubles: true,
        moveResult: {
          oldPosition: currentPlayer.position,
          newPosition: currentPlayer.position,
          steps: 0,
          passedGo: false
        },
        gameState: gameState.getState(),
        jailRoll: true
      });
      // End turn after escaping jail — next turn they roll normally
      scheduleMoveResolution(playerId, 0, 0, { action: 'finish-turn' });
      return true;
    } else {
      currentPlayer.jailTurns++;
      if (currentPlayer.jailTurns >= 3) {
        // #10: After 3 failed rolls, forced to pay $100
        currentPlayer.money -= 100;
        gameState.taxPool += 100;
        currentPlayer.inJail = false;
        currentPlayer.jailTurns = 0;
        logEvent(`🔓 ${currentPlayer.character} paid $100 to leave jail (3 failed rolls).`, 'tax');
        emitToRoom('dice-rolled', {
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
        if (currentPlayer.money < 0) {
          handleBankruptcy(currentPlayer);
          return true;
        }
        scheduleMoveResolution(playerId, 0, 0, { action: 'finish-turn' });
        return true;
      } else {
        logEvent(`🔒 ${currentPlayer.character} failed to roll doubles (jail turn ${currentPlayer.jailTurns}/3)`, 'roll');
        emitToRoom('dice-rolled', {
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
        // End turn — stay in jail
        scheduleMoveResolution(playerId, 0, 0, { action: 'finish-turn' });
        return true;
      }
    }
  }

  const moveResult = gameState.movePlayer(playerId, diceResult.total);
  recordMoveStats(currentPlayer, moveResult);
  setTurnPhase('moving');

  // #18: History log includes tile name
  const landedTile = gameState.properties[moveResult.newPosition];
  const tileName = landedTile ? landedTile.name : `tile ${moveResult.newPosition}`;
  logEvent(`🎲 ${currentPlayer.character} rolled ${diceResult.total} and went to ${tileName}${diceResult.isDoubles ? ' (DOUBLES!)' : ''}`, 'roll');

  emitToRoom('dice-rolled', {
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
    if (currentPlayer.isBot) {
      logEvent(`⏰ ${currentPlayer.character} ran out of time on ${tile.name}. Skipping the auction.`, 'system');
    } else {
      logEvent(`⏰ ${currentPlayer.character} ran out of time on ${tile.name}. Starting auction.`, 'system');
    }
  } else {
    logEvent(`⏭️ ${currentPlayer.character} passed on ${tile.name}`, 'pass');
  }

  if (currentPlayer.isBot) {
    waitForTurnEndCurrentPlayer();
    return true;
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

  emitToRoom('property-bought', {
    playerId: currentPlayer.id,
    character: currentPlayer.character,
    tileIndex: tile.index,
    tileName: tile.name,
    price: tile.price,
    gameState: gameState.getState()
  });
  waitForTurnEndCurrentPlayer();
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
    return;
  }

  if (expiredTimer.phase === 'done') {
    logEvent(`⏰ ${currentPlayer.character} ran out of time. Ending the turn.`, 'system');
    advanceTurnGlobal();
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

function getPlayerTradeAssetValue(player, propertyIndexes) {
  if (!gameState || !player) return 0;

  return (propertyIndexes || []).reduce((total, index) => {
    const tile = gameState.properties[index];
    if (!tile) return total;

    let value = tile.price || 0;
    if (tile.type === 'railroad') {
      const railroadCount = gameState.properties.filter(entry => entry.type === 'railroad' && entry.owner === player.id).length;
      value += railroadCount * 25;
    } else if (tile.type === 'utility') {
      const utilityCount = gameState.properties.filter(entry => entry.type === 'utility' && entry.owner === player.id).length;
      value += utilityCount * 20;
    } else if (tile.type === 'property' && tile.colorGroup) {
      if (wouldOwnFullColorGroup(player.id, tile)) {
        value += 120;
      }
      value += (tile.houses || 0) * Math.floor(tile.price * 0.5);
    }

    if (tile.isMortgaged) {
      value -= Math.floor((tile.price || 0) * 0.25);
    }

    return total + value;
  }, 0);
}

function shouldBotAcceptTrade(trade) {
  if (!gameState || !trade) return false;

  const bot = gameState.getPlayerById(trade.toId);
  const otherPlayer = gameState.getPlayerById(trade.fromId);
  if (!bot || !otherPlayer || !bot.isBot || !bot.isActive || !otherPlayer.isActive) return false;

  const incomingCash = trade.requestCash;
  const outgoingCash = trade.offerCash;
  const incomingValue = getPlayerTradeAssetValue(bot, trade.requestProperties);
  const outgoingValue = getPlayerTradeAssetValue(otherPlayer, trade.offerProperties);

  let score = incomingCash + incomingValue - outgoingCash - outgoingValue;

  if ((trade.requestProperties || []).length === 0 && trade.requestCash > 0) {
    score += 20;
  }
  if ((trade.offerProperties || []).length === 0 && trade.offerCash > 0) {
    score -= 15;
  }

  return score >= -25;
}

function executeAcceptedTrade(trade, accepter) {
  if (!gameState || !trade || !accepter) return null;

  const offerer = gameState.getPlayerById(trade.fromId);
  if (!offerer) return null;

  const offererMoneyBefore = offerer.money;
  const accepterMoneyBefore = accepter.money;

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
  checkBankruptcyRecovery(offerer);
  checkBankruptcyRecovery(accepter);
  syncPlayerPropertyLists();
  removePendingTrade(trade.id);
  invalidateStaleTrades();

  logEvent(`✅ ${accepter.character} accepted trade with ${offerer.character}!`, 'trade');
  logPlayerMoneyDelta(
    offerer,
    offerer.money - offererMoneyBefore,
    describeTradeCashForPlayer(offerer, trade, accepter),
    'trade'
  );
  logPlayerMoneyDelta(
    accepter,
    accepter.money - accepterMoneyBefore,
    describeTradeCashForPlayer(accepter, trade, offerer),
    'trade'
  );

  const payload = {
    tradeId: trade.id,
    fromId: offerer.id,
    toId: accepter.id,
    fromCharacter: offerer.character,
    toCharacter: accepter.character,
    gameState: gameState.getState()
  };
  emitToRoom('trade-completed', payload);
  return payload;
}

function queueBotTradeDecision(trade) {
  if (!gameState || !trade) return;

  const bot = gameState.getPlayerById(trade.toId);
  if (!bot?.isBot || !bot.isActive) return;

  scheduleBotTimer(`trade:${trade.id}`, randomBotDelay(), () => {
    if (!gameState) return;

    const liveTrade = pendingTrades.get(trade.id);
    if (!liveTrade) return;

    const validation = TradeUtils.validateTradeOffer(gameState, liveTrade);
    if (!validation.ok) {
      removePendingTrade(liveTrade.id, {
        code: validation.code,
        message: validation.message
      });
      return;
    }

    const liveBot = gameState.getPlayerById(liveTrade.toId);
    const offerer = gameState.getPlayerById(liveTrade.fromId);
    if (!liveBot || !offerer) return;

    if (shouldBotAcceptTrade(liveTrade)) {
      executeAcceptedTrade(liveTrade, liveBot);
      return;
    }

    removePendingTrade(liveTrade.id);
    logEvent(`❌ ${liveBot.character} rejected trade from ${offerer.character}`, 'trade');
    io.to(getPlayerRoom(offerer.id)).emit('trade-rejected', {
      tradeId: liveTrade.id,
      fromId: offerer.id,
      toId: liveBot.id
    });
  });
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

function queueBotEndTurnIfNeeded(player = gameState?.getCurrentPlayer()) {
  clearBotTimersByPrefix('turn:');

  if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return;
  if (!player?.isBot || !player.isActive) return;
  if (gameState.getCurrentPlayer()?.id !== player.id) return;
  if (gameState.turnPhase !== 'done') return;

  scheduleBotTimer(`turn:${player.id}`, randomBotDelay(), () => {
    if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return;
    const currentPlayer = gameState.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== player.id || !currentPlayer.isBot || gameState.turnPhase !== 'done') return;
    advanceTurnGlobal();
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
    return;
  }

  if (gameState.turnPhase === 'done') {
    queueBotEndTurnIfNeeded(currentPlayer);
  }
}

function bindRoomHandler(socket, roomState, eventName, handler) {
  socket.on(eventName, (...args) => {
    if (roomState?.endedAt && eventName !== 'disconnect') return;
    withRoomState(roomState, () => handler(...args));
  });
}

function isRoomHost(socket, roomState) {
  return Boolean(roomState?.hostSessionToken && socket.data.sessionToken === roomState.hostSessionToken);
}

function closeRoom(roomState, endedByCharacter = null) {
  withRoomState(roomState, () => {
    roomState.endedAt = Date.now();
    emitToRoom('room-ended', {
      roomCode: roomState.code,
      endedBy: endedByCharacter,
      message: endedByCharacter
        ? `${endedByCharacter} ended the room. Create a new invite to play again.`
        : 'This room has ended. Create a new invite to play again.'
    });
    clearRoomGameRuntime({ preserveLobby: false });
    io.in(getSocketRoom(roomState.code)).disconnectSockets(true);
  });
}

io.on('connection', socket => {
  socket.data.sessionToken = normalizeSessionToken(socket.handshake.auth?.sessionToken);
  socket.data.roomCode = normalizeRoomCode(socket.handshake.auth?.roomCode || socket.handshake.query?.room);
  console.log(`✦ Player connected: ${socket.id}`);

  if (!socket.data.roomCode) {
    socket.emit('room-error', { message: 'Missing room code. Create or join a room first.' });
    socket.disconnect(true);
    return;
  }

  const roomState = getOrCreateRoomState(socket.data.roomCode, socket.data.sessionToken);
  if (!roomState || roomState.endedAt) {
    socket.emit('room-error', { message: 'That room is no longer available. Create a new room.' });
    socket.disconnect(true);
    return;
  }
  if (roomState.kickedSessionTokens?.has(socket.data.sessionToken)) {
    socket.emit('room-error', { message: 'You were removed from this room by the host.' });
    socket.disconnect(true);
    return;
  }

  socket.join(getSocketRoom(roomState.code));

  withRoomState(roomState, () => {
    const player = gameState?.getPlayerBySessionToken(socket.data.sessionToken) || null;
    if (player) {
      replaceSocketBinding(socket, player);
      resumePausedGameIfPossible(player);
      emitGameStateSync();
    } else {
      const lobbyEntry = getOrCreateLobbyEntry(socket);
      emitPlayerSession(socket, gameState?.getPlayerById(lobbyEntry.playerId) || lobbyEntry);
    }

    socket.emit('lobby-update', getLobbyState());
    if (gameState && gameState.isGameStarted) {
      emitGameStateSync({ targetSocket: socket });
    }
  });

  bindRoomHandler(socket, roomState, 'select-character', data => {
    const characterName = typeof data === 'string' ? data : data?.name;
    const customColor = normalizeCustomColor(typeof data === 'object' ? data?.customColor : null);

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
    currentEntry.tokenId = resolveLobbyToken(characterName, currentEntry.tokenId);
    currentEntry.name = characterName;
    if (customColor) currentEntry.customColor = customColor;
    else delete currentEntry.customColor;
    currentEntry.socketId = socket.id;
    socket.data.playerId = currentEntry.playerId;
    socket.emit('character-confirmed', {
      character: characterName,
      tokenId: currentEntry.tokenId,
      customColor: currentEntry.customColor || null
    });
    emitPlayerSession(socket, {
      id: currentEntry.playerId,
      character: characterName,
      tokenId: currentEntry.tokenId,
      customColor: currentEntry.customColor || null
    });
    emitLobbyUpdate();
  });

  bindRoomHandler(socket, roomState, 'select-token', tokenId => {
    if (gameState && gameState.isGameStarted) {
      socket.emit('character-error', { message: 'Game already in progress' });
      return;
    }

    const normalizedTokenId = normalizeTokenId(tokenId);
    if (!normalizedTokenId) {
      socket.emit('character-error', { message: 'Invalid token' });
      return;
    }

    const currentEntry = getOrCreateLobbyEntry(socket);
    if (!currentEntry.character) {
      socket.emit('character-error', { message: 'Choose a character first' });
      return;
    }

    currentEntry.tokenId = normalizedTokenId;
    socket.emit('token-confirmed', { tokenId: normalizedTokenId });
    emitPlayerSession(socket, {
      id: currentEntry.playerId,
      character: currentEntry.character,
      tokenId: currentEntry.tokenId
    });
    emitLobbyUpdate();
  });

  bindRoomHandler(socket, roomState, 'update-custom-color', data => {
    if (gameState && gameState.isGameStarted) {
      socket.emit('character-error', { message: 'Game already in progress' });
      return;
    }

    const entry = getLobbyEntryBySocketId(socket.id);
    if (!entry || !entry.character) return;

    const customColor = normalizeCustomColor(typeof data === 'object' ? data?.customColor : null);
    if (customColor) entry.customColor = customColor;
    else delete entry.customColor;

    emitPlayerSession(socket, {
      id: entry.playerId,
      character: entry.character,
      tokenId: entry.tokenId || null,
      customColor: entry.customColor || null
    });
    emitLobbyUpdate();
  });

  bindRoomHandler(socket, roomState, 'deselect-character', () => {
    const entry = getLobbyEntryBySocketId(socket.id);
    if (!entry) return;
    entry.character = null;
    entry.tokenId = null;
    entry.name = null;
    emitPlayerSession(socket, {
      id: entry.playerId,
      character: null,
      tokenId: null,
      customColor: entry.customColor || null
    });
    emitLobbyUpdate();
  });

  bindRoomHandler(socket, roomState, 'add-random-bot', () => {
    if (!isRoomHost(socket, roomState)) {
      socket.emit('game-error', { message: 'Only the room host can add bots.' });
      return;
    }
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

  bindRoomHandler(socket, roomState, 'clear-lobby-bots', () => {
    if (!isRoomHost(socket, roomState)) {
      socket.emit('game-error', { message: 'Only the room host can remove bots.' });
      return;
    }
    if (gameState && gameState.isGameStarted) {
      socket.emit('game-error', { message: 'You can only clear bots from the lobby.' });
      return;
    }

    clearLobbyBots();
    emitLobbyUpdate();
  });

  bindRoomHandler(socket, roomState, 'requestStartGame', () => {
    if (!isRoomHost(socket, roomState)) {
      socket.emit('game-error', { message: 'Only the room host can start the match.' });
      return;
    }
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
        entry.customColor || CHARACTER_COLORS[entry.character],
        entry.isBot ? null : entry.sessionToken,
        {
          isBot: Boolean(entry.isBot),
          isConnected: entry.isBot ? true : Boolean(entry.socketId),
          tokenId: resolveLobbyToken(entry.character, entry.tokenId)
        }
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
    emitToRoom('gameStarted', buildGameStatePayload());
    queueBotTurnIfNeeded(gameState.getCurrentPlayer());
  });

  bindRoomHandler(socket, roomState, 'end-room', () => {
    if (!isRoomHost(socket, roomState)) {
      socket.emit('game-error', { message: 'Only the room host can end this room.' });
      return;
    }

    const hostPlayer = getSocketPlayer(socket) || gameState?.getPlayerBySessionToken(socket.data.sessionToken) || lobbyPlayers.get(socket.data.sessionToken) || null;
    closeRoom(roomState, hostPlayer?.character || 'The host');
  });

  bindRoomHandler(socket, roomState, 'end-game', () => {
    if (!isRoomHost(socket, roomState)) {
      socket.emit('game-error', { message: 'Only the room host can end the current match.' });
      return;
    }
    if (!gameState || !gameState.isGameStarted) {
      socket.emit('game-error', { message: 'There is no active match to end.' });
      return;
    }

    const hostPlayer = getSocketPlayer(socket) || gameState?.getPlayerBySessionToken(socket.data.sessionToken) || lobbyPlayers.get(socket.data.sessionToken) || null;
    endGameForRoom(roomState, hostPlayer?.character || 'The host');
  });

  bindRoomHandler(socket, roomState, 'kick-player', data => {
    if (!isRoomHost(socket, roomState)) {
      socket.emit('game-error', { message: 'Only the room host can kick players.' });
      return;
    }

    const targetPlayerId = typeof data?.playerId === 'string' ? data.playerId : '';
    if (!targetPlayerId) {
      socket.emit('game-error', { message: 'Choose a player to kick.' });
      return;
    }

    const hostPlayer = getSocketPlayer(socket) || gameState?.getPlayerBySessionToken(socket.data.sessionToken) || lobbyPlayers.get(socket.data.sessionToken) || null;
    const result = kickPlayerFromRoom(roomState, targetPlayerId, hostPlayer?.character || 'The host');
    if (!result.ok) {
      socket.emit('game-error', { message: result.message });
    }
  });

  bindRoomHandler(socket, roomState, 'roll-dice', () => {
    if (!gameState || !gameState.isGameStarted) return;
    if (auctionState) {
      socket.emit('game-error', { message: 'Auction in progress' });
      return;
    }
    const playerRecord = getSocketPlayer(socket);
    if (!handleRollDice(playerRecord?.id)) {
      socket.emit('game-error', { message: 'You cannot roll dice right now.' });
    }
  });

  bindRoomHandler(socket, roomState, 'move-complete', () => {
    if (!gameState || !gameState.isGameStarted) return;
    const currentPlayer = gameState.getCurrentPlayer();
    const playerRecord = getSocketPlayer(socket);
    if (!currentPlayer || !playerRecord || currentPlayer.id !== playerRecord.id) return;
    resolveMoveCompletion(playerRecord.id);
  });

  bindRoomHandler(socket, roomState, 'declare-bankruptcy', () => {
    if (!gameState || !gameState.isGameStarted) return;
    const player = getSocketPlayer(socket);
    if (!player) return;

    if (!player.isActive) {
      socket.emit('game-error', { message: 'You are already bankrupt.' });
      return;
    }

    const currentPlayer = gameState.getCurrentPlayer();
    const wasCurrentPlayer = currentPlayer?.id === player.id;
    logEvent(`🏳️ ${player.character} surrendered and declared bankruptcy voluntarily.`, 'bankrupt');
    executeBankruptcy(player);
    if (wasCurrentPlayer && gameState && gameState.getActivePlayers().length > 1) {
        advanceTurnGlobal();
    }
  });

  bindRoomHandler(socket, roomState, 'end-turn', () => {
    if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState) return;
    const currentPlayer = gameState.getCurrentPlayer();
    const playerRecord = getSocketPlayer(socket);
    if (!currentPlayer || !playerRecord || currentPlayer.id !== playerRecord.id) return;
    if (gameState.turnPhase !== 'done') return;
    if (currentPlayer.inJail) {
      socket.emit('game-error', { message: 'Choose a jail action before ending your turn.' });
      return;
    }
    if (currentPlayer.money < 0) {
      socket.emit('game-error', { message: 'Recover from debt or use Declare Bankruptcy before ending your turn.' });
      return;
    }
    checkBankruptcyRecovery(currentPlayer);
    advanceTurnGlobal();
  });

  bindRoomHandler(socket, roomState, 'buy-property', data => {
    const playerRecord = getSocketPlayer(socket);
    handleBuyProperty(playerRecord?.id, data.tileIndex);
  });

  bindRoomHandler(socket, roomState, 'buy-out-jail', () => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord || !playerRecord.inJail) return;
    // #10: Jail buyout costs $100 (changed from $50)
    if (playerRecord.money < 100) {
      socket.emit('game-error', { message: 'Not enough money to buy out of jail ($100)' });
      return;
    }
    // #10: Must be current player and it must be their turn
    const currentPlayer = gameState.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerRecord.id) {
      socket.emit('game-error', { message: 'You can only buy out of jail on your turn.' });
      return;
    }

    playerRecord.money -= 100;
    gameState.taxPool += 100;
    playerRecord.inJail = false;
    playerRecord.jailTurns = 0;
    logEvent(`🔓 ${playerRecord.character} paid $100 to leave jail!`, 'tax');
    invalidateStaleTrades();

    emitToRoom('jail-state-changed', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      inJail: false,
      gameState: gameState.getState()
    });

    // Leaving jail now waits for an explicit end-turn or timer expiry.
    waitForTurnEndCurrentPlayer();
  });

  bindRoomHandler(socket, roomState, 'use-pardon', () => {
    if (!gameState || !gameState.isGameStarted) return;

    const playerRecord = getSocketPlayer(socket);
    if (!playerRecord || !playerRecord.inJail || playerRecord.pardons <= 0) return;
    const currentPlayer = gameState.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerRecord.id) {
      socket.emit('game-error', { message: 'You can only use a pardon card on your turn.' });
      return;
    }

    playerRecord.pardons--;
    playerRecord.inJail = false;
    playerRecord.jailTurns = 0;
    logEvent(`🃏 ${playerRecord.character} used a Pardon Card to leave jail!`, 'card');

    emitToRoom('jail-state-changed', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      inJail: false,
      gameState: gameState.getState()
    });

    waitForTurnEndCurrentPlayer();
  });

  bindRoomHandler(socket, roomState, 'pass-property', () => {
    const playerRecord = getSocketPlayer(socket);
    handlePassProperty(playerRecord?.id);
  });

  bindRoomHandler(socket, roomState, 'dev-command', (data = {}) => {
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

  bindRoomHandler(socket, roomState, 'own-auction', data => {
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
    startAuction(data.tileIndex, Math.max(1, Number.parseInt(data.startPrice, 10) || Math.floor(tile.price / 2)), playerRecord.id, {
      reason: 'own',
      returnPhase,
      returnPlayerId: playerRecord.id
    });
  });

  bindRoomHandler(socket, roomState, 'place-bid', data => {
    const playerRecord = getSocketPlayer(socket);
    const result = handlePlaceBid(playerRecord?.id, data.amount);
    if (!result.ok && result.message) {
      socket.emit('game-error', { message: result.message });
    }
  });

  bindRoomHandler(socket, roomState, 'trade-offer', data => {
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
    socket.emit('trade-sent', {
      trade,
      replacedTradeId: trade.counterToTradeId || null
    });

    if (gameState.getPlayerById(trade.toId)?.isBot) {
      queueBotTradeDecision(trade);
      return;
    }

    io.to(getPlayerRoom(trade.toId)).emit('trade-incoming', trade);
  });

  bindRoomHandler(socket, roomState, 'trade-accept', data => {
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

    executeAcceptedTrade(trade, accepter);
  });

  bindRoomHandler(socket, roomState, 'trade-reject', data => {
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

  bindRoomHandler(socket, roomState, 'upgrade-property', data => {
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

    emitToRoom('property-upgraded', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      houses: tile.houses,
      cost: upgradeCost,
      gameState: gameState.getState()
    });
  });

  bindRoomHandler(socket, roomState, 'downgrade-property', data => {
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
    checkBankruptcyRecovery(playerRecord);
    logEvent(`🔻 ${playerRecord.character} sold a house on ${tile.name} (+$${refund})`, 'sell');
    invalidateStaleTrades();

    emitToRoom('property-downgraded', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      houses: tile.houses,
      refund,
      gameState: gameState.getState()
    });
  });

  bindRoomHandler(socket, roomState, 'mortgage-property', data => {
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
    checkBankruptcyRecovery(playerRecord);
    logEvent(`🏦 ${playerRecord.character} mortgaged ${tile.name} (+$${mortgageValue})`, 'sell');
    invalidateStaleTrades();

    emitToRoom('property-mortgaged', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      mortgageValue,
      gameState: gameState.getState()
    });
  });

  bindRoomHandler(socket, roomState, 'unmortgage-property', data => {
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

    emitToRoom('property-unmortgaged', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      cost: unmortgageCost,
      gameState: gameState.getState()
    });
  });

  bindRoomHandler(socket, roomState, 'sell-property', data => {
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
    checkBankruptcyRecovery(playerRecord);
    logEvent(`💰 ${playerRecord.character} sold ${tile.name} to the bank (+$${sellValue})`, 'sell');
    invalidateStaleTrades();

    emitToRoom('property-sold', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      sellValue,
      gameState: gameState.getState()
    });
  });

  bindRoomHandler(socket, roomState, 'save-game', () => {
    const playerRecord = getSocketPlayer(socket);
    if (!isRoomHost(socket, roomState) || !playerRecord) {
      socket.emit('game-error', { message: 'Only the host can save the game.' });
      return;
    }
    if (!gameState || !gameState.isGameStarted) {
      socket.emit('game-error', { message: 'No active game to save.' });
      return;
    }
    const saveState = buildSavePayload();
    socket.emit('game-saved', { saveState });
    logEvent(`💾 ${playerRecord?.character || 'The host'} saved the game.`, 'system');
  });

  bindRoomHandler(socket, roomState, 'load-game', (data) => {
    const playerRecord = getSocketPlayer(socket);
    if (!isRoomHost(socket, roomState) || !playerRecord) {
      socket.emit('game-error', { message: 'Only the host can load a game.' });
      return;
    }
    if (gameState && gameState.isGameStarted) {
      socket.emit('game-error', { message: 'Cannot load a game while one is already in progress. End the current game first.' });
      return;
    }
    try {
      const parsedState = typeof data.saveState === 'string' ? JSON.parse(data.saveState) : data.saveState;
      const restored = restoreGameStateFromSave(parsedState);

      clearPendingMoveResolution();
      clearAllBotTimers();
      stopTurnTimer(false);
      if (auctionTimer) {
        clearInterval(auctionTimer);
        auctionTimer = null;
      }
      auctionState = null;
      pausedTurnTimerState = null;
      pendingTrades.clear();

      gameState = restored.restoredGameState;
      actionDeck = restored.restoredActionDeck;
      eventHistory.length = 0;
      restored.restoredEventHistory.forEach(event => eventHistory.push(event));
      lastDiceTotal = restored.restoredLastDiceTotal;

      gameState.players.forEach(player => {
        const liveSocket = player.socketId ? io.sockets.sockets.get(player.socketId) : null;
        player.isConnected = Boolean(player.isBot || liveSocket);
        if (liveSocket) {
          replaceSocketBinding(liveSocket, player);
        }
      });

      logEvent(`📂 ${playerRecord?.character || 'The host'} loaded a saved game!`, 'system');
      emitToRoom('game-loaded', { gameState: gameState.getState() });
      emitGameStateSync({ restartTurnTimer: true });
    } catch (err) {
      socket.emit('game-error', { message: 'Failed to load save file: ' + err.message });
    }
  });

  bindRoomHandler(socket, roomState, 'disconnect', () => {
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
    if (isCurrentPlayer && ['waiting', 'buying', 'done'].includes(gameState.turnPhase)) {
      pauseGameForDisconnect(playerRecord);
    }

    emitGameStateSync();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🎲 Monopoly server running at http://localhost:${PORT}\n`);
});
