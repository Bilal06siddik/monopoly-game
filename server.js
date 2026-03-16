const express = require('express');
const http = require('http');
const path = require('path');
const { randomUUID } = require('crypto');
const compression = require('compression');
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
const DEFAULT_BOARD_ID = BOARD_DATA.DEFAULT_BOARD_ID || 'egypt';
const BOARD_IDS = BOARD_DATA.BOARD_IDS || [DEFAULT_BOARD_ID];
const BOARD_MAPS = BOARD_DATA.BOARD_MAPS || {
  [DEFAULT_BOARD_ID]: {
    id: DEFAULT_BOARD_ID,
    name: 'Egypt',
    tiles: BOARD_DATA
  }
};
const getBoardDataById = typeof BOARD_DATA.getBoardData === 'function'
  ? BOARD_DATA.getBoardData.bind(BOARD_DATA)
  : (boardId => BOARD_MAPS[boardId]?.tiles || BOARD_DATA);

const app = express();
const server = http.createServer(app);
// Keep this above the base64-expanded transport size so the server can reply with
// a validation error instead of dropping the socket before the event handler runs.
const SOCKET_MAX_HTTP_BUFFER_SIZE = 8 * 1024 * 1024;
const MAX_CUSTOM_AVATAR_BYTES = 2 * 1024 * 1024;

const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE,
  perMessageDeflate: {
    threshold: 1024
  },
  httpCompression: {
    threshold: 1024
  }
});
const UPGRADE_MODEL_FILES = new Set([
  'small_buildingB.glb',
  'small_buildingA.glb',
  'large_buildingD.glb',
  'skyscraperE.glb',
  'skyscraperB.glb'
]);

function setStaticCacheHeaders(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const isProduction = process.env.NODE_ENV === 'production';
  const hasContentHash = /\.[a-f0-9]{8,}\./i.test(path.basename(filePath));
  const immutableAssetExtensions = new Set([
    '.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif', '.glb', '.ico'
  ]);

  if (ext === '.html') {
    res.setHeader('Cache-Control', 'no-cache');
    return;
  }

  // In local development we want refreshes to pick up JS/CSS edits immediately.
  if (!isProduction && (ext === '.js' || ext === '.css')) {
    res.setHeader('Cache-Control', 'no-cache');
    return;
  }

  if (immutableAssetExtensions.has(ext)) {
    if (hasContentHash) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    return;
  }

  res.setHeader('Cache-Control', 'public, max-age=3600');
}

app.use(compression({ threshold: 1024 }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: setStaticCacheHeaders
}));
app.use('/shared', express.static(path.join(__dirname, 'shared'), {
  setHeaders: setStaticCacheHeaders
}));
app.get('/models/:file', (req, res) => {
  const file = typeof req.params.file === 'string' ? req.params.file.trim() : '';
  if (!UPGRADE_MODEL_FILES.has(file)) {
    res.sendStatus(404);
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(path.join(__dirname, file));
});

const CHARACTERS = ['bilo', 'osss', 'bdlbaky', 'fawzy', 'hamza', 'missiry', 'custom'];
const EXCLUSIVE_CHARACTERS = CHARACTERS.filter(character => character !== 'custom');
const CHARACTER_COLORS = {
  bilo:     '#8e44ad', // Deep Purple
  osss:     '#f1c40f', // Gold
  bdlbaky:  '#2ecc71', // Emerald Green
  fawzy:    '#e74c3c', // Crimson Red
  hamza:    '#3498db', // Ocean Blue
  missiry:  '#e61a8d', // Hot Pink
  custom:   '#95a5a6'  // Slate Grey
};
const CUSTOM_PLAYER_COLORS = [
  '#00bcd4',
  '#ff6b6b',
  '#ffd166',
  '#06d6a0',
  '#4d96ff',
  '#f72585',
  '#f4a261',
  '#90be6d'
];
const ALLOWED_CUSTOM_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
]);

const TURN_TIMER_IDLE_SECONDS = Object.freeze({
  waiting: 30,
  buying: 25,
  done: 25
});
const TURN_TIMER_ACTIVE_SECONDS = Object.freeze({
  waiting: 60,
  buying: 45,
  done: 45
});
const TURN_TIMER_PHASES = new Set(['waiting', 'buying', 'done']);
const HOST_TIMER_EXTENSION_DEFAULT_SECONDS = 15;
const HOST_TIMER_EXTENSION_MAX_SECONDS = 180;
const AUCTION_TIMER_SECONDS = 10;
const AUCTION_BID_RESET_SECONDS = 5;
const DICE_ANIMATION_MS = 1700;
const TOKEN_STEP_MS = 170;
const MOVE_RESOLUTION_BUFFER_MS = 120;
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
let stateSequence = 0;
let activeListenPort = null;
let serverStartPromise = null;

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
    selectedBoardId: DEFAULT_BOARD_ID,
    boardVotes: new Map(),
    turnTimerEnabled: true,
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
    lastDiceTotal: 0,
    stateSequence: 0
  };
}

function resolveBoardId(boardId) {
  return BOARD_MAPS[boardId] ? boardId : DEFAULT_BOARD_ID;
}

function getBoardMapById(boardId = DEFAULT_BOARD_ID) {
  const resolvedBoardId = resolveBoardId(boardId);
  return BOARD_MAPS[resolvedBoardId] || {
    id: resolvedBoardId,
    name: resolvedBoardId,
    tiles: getBoardDataById(resolvedBoardId)
  };
}

function getBoardTiles(boardId = DEFAULT_BOARD_ID) {
  return getBoardMapById(boardId).tiles || BOARD_DATA;
}

function pruneBoardVotes(roomState) {
  if (!roomState) return;
  if (!(roomState.boardVotes instanceof Map)) {
    roomState.boardVotes = new Map();
  }

  for (const [sessionToken, boardId] of roomState.boardVotes.entries()) {
    const entry = roomState.lobbyPlayers?.get(sessionToken) || null;
    if (!entry || entry.isBot || !BOARD_MAPS[boardId]) {
      roomState.boardVotes.delete(sessionToken);
    }
  }
}

function getBoardVoteCounts(roomState) {
  const counts = Object.fromEntries(BOARD_IDS.map(boardId => [boardId, 0]));
  pruneBoardVotes(roomState);

  for (const boardId of roomState?.boardVotes?.values() || []) {
    const resolvedBoardId = resolveBoardId(boardId);
    counts[resolvedBoardId] = (counts[resolvedBoardId] || 0) + 1;
  }

  return counts;
}

function resolveSelectedBoardId(roomState) {
  const fallbackBoardId = resolveBoardId(roomState?.selectedBoardId);
  const voteCounts = getBoardVoteCounts(roomState);
  const highestVoteCount = Math.max(0, ...Object.values(voteCounts));

  if (highestVoteCount === 0) {
    return fallbackBoardId;
  }

  const leadingBoardIds = BOARD_IDS.filter(boardId => voteCounts[boardId] === highestVoteCount);
  return leadingBoardIds.length === 1 ? leadingBoardIds[0] : fallbackBoardId;
}

function syncSelectedBoardId(roomState) {
  const selectedBoardId = resolveSelectedBoardId(roomState);
  if (roomState) {
    roomState.selectedBoardId = selectedBoardId;
  }
  return selectedBoardId;
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
  stateSequence = roomState?.stateSequence ?? 0;
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
  roomState.stateSequence = stateSequence;
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
    lastDiceTotal,
    stateSequence
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
    stateSequence = previous.stateSequence;
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
  if (!(roomState.boardVotes instanceof Map)) {
    roomState.boardVotes = new Map();
  }
  roomState.selectedBoardId = resolveBoardId(roomState.selectedBoardId);
  if (typeof roomState.turnTimerEnabled !== 'boolean') {
    roomState.turnTimerEnabled = true;
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

function getPlayerLabel(player) {
  return player?.name || player?.character || 'Player';
}

function logPlayerMoneyDelta(player, delta, reason, type = 'info') {
  if (!player || !delta) return;
  const direction = delta > 0 ? 'received' : 'paid';
  logEvent(`💵 ${getPlayerLabel(player)} ${direction} ${formatCurrency(delta)} ${reason}`, type);
}

function describeTradeCashForPlayer(player, trade, counterpart) {
  if (!player || !trade || !counterpart) return '';

  if (player.id === trade.fromId) {
    const gave = trade.offerCash;
    const received = trade.requestCash;
    if (gave > 0 && received > 0) {
      return `in cash trade with ${getPlayerLabel(counterpart)} (gave $${gave}, received $${received})`;
    }
    if (gave > 0) {
      return `to ${getPlayerLabel(counterpart)} in trade`;
    }
    if (received > 0) {
      return `from ${getPlayerLabel(counterpart)} in trade`;
    }
    return '';
  }

  const gave = trade.requestCash;
  const received = trade.offerCash;
  if (gave > 0 && received > 0) {
    return `in cash trade with ${getPlayerLabel(counterpart)} (gave $${gave}, received $${received})`;
  }
  if (gave > 0) {
    return `to ${getPlayerLabel(counterpart)} in trade`;
  }
  if (received > 0) {
    return `from ${getPlayerLabel(counterpart)} in trade`;
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

function isCharacterExclusive(character) {
  return character !== 'custom';
}

function getLobbyEntryByPlayerId(playerId) {
  for (const entry of lobbyPlayers.values()) {
    if (entry.playerId === playerId) return entry;
  }
  return null;
}

function getAvailableLobbyCharacters() {
  return EXCLUSIVE_CHARACTERS.filter(character => !getLobbyEntryByCharacter(character));
}

function resolveLobbyToken(character, preferredTokenId = null) {
  return normalizeTokenId(preferredTokenId) || getDefaultTokenForCharacter(character);
}

function normalizeCustomColor(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toLowerCase() : null;
}

function normalizeCustomName(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.slice(0, 15);
}

function normalizeCustomAvatarUrl(value) {
  if (typeof value !== 'string') {
    return { avatarUrl: null, error: null };
  }

  const normalized = value.trim();
  if (!normalized) {
    return { avatarUrl: null, error: null };
  }

  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(normalized);
  if (!match) {
    return {
      avatarUrl: null,
      error: 'Custom avatar must be a base64 PNG, JPG, WEBP, or GIF image.'
    };
  }

  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_CUSTOM_AVATAR_MIME_TYPES.has(mimeType)) {
    return {
      avatarUrl: null,
      error: 'Custom avatar format is not supported. Use PNG, JPG, WEBP, or GIF.'
    };
  }

  const base64Payload = match[2].replace(/\s+/g, '');
  if (!base64Payload || !/^[a-z0-9+/]+={0,2}$/i.test(base64Payload) || base64Payload.length % 4 !== 0) {
    return {
      avatarUrl: null,
      error: 'Custom avatar data is invalid. Please upload the image again.'
    };
  }

  const binarySize = Buffer.byteLength(base64Payload, 'base64');
  if (!Number.isFinite(binarySize) || binarySize <= 0) {
    return {
      avatarUrl: null,
      error: 'Custom avatar data is invalid. Please upload the image again.'
    };
  }

  if (binarySize > MAX_CUSTOM_AVATAR_BYTES) {
    return {
      avatarUrl: null,
      error: 'Custom avatar image must be 2MB or smaller.'
    };
  }

  return {
    avatarUrl: `data:${mimeType};base64,${base64Payload}`,
    error: null
  };
}

function getDefaultColorForLobbyEntry(entry, customIndex = 0) {
  if (!entry?.character) return '#9aa4b2';
  if (entry.customColor) return entry.customColor;
  if (entry.character === 'custom') {
    return CUSTOM_PLAYER_COLORS[customIndex % CUSTOM_PLAYER_COLORS.length];
  }
  return CHARACTER_COLORS[entry.character] || '#9aa4b2';
}

function getLobbyState() {
  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
  const selectedBoardId = syncSelectedBoardId(roomState);
  const boardVoteCounts = getBoardVoteCounts(roomState);
  const playerList = [...lobbyPlayers.values()]
    .filter(entry => entry.character)
    .map(entry => ({
      id: entry.playerId,
      name: entry.character === 'custom' ? (entry.customName || 'Custom Player') : entry.name,
      character: entry.character,
      tokenId: entry.tokenId || null,
      customAvatarUrl: entry.customAvatarUrl || null,
      isBot: Boolean(entry.isBot)
    }));

  return {
    roomCode: currentRoomCode,
    joinUrl: currentRoomCode ? `/?room=${currentRoomCode}` : null,
    selectedBoardId,
    turnTimerEnabled: isTurnTimerEnabled(roomState),
    hostPlayerId: roomState?.hostSessionToken
      ? (gameState?.getPlayerBySessionToken(roomState.hostSessionToken)?.id
        || lobbyPlayers.get(roomState.hostSessionToken)?.playerId
        || null)
      : null,
    players: playerList,
    members: [...lobbyPlayers.values()].map(entry => ({
      playerId: entry.playerId,
      name: entry.character === 'custom' ? (entry.customName || 'Custom Player') : (entry.name || null),
      character: entry.character || null,
      tokenId: entry.tokenId || null,
      customAvatarUrl: entry.customAvatarUrl || null,
      boardVoteId: roomState?.boardVotes?.get(entry.sessionToken) || null,
      isBot: Boolean(entry.isBot),
      isOnline: Boolean(entry.isBot || entry.socketId),
      isHost: Boolean(roomState?.hostSessionToken && entry.sessionToken === roomState.hostSessionToken)
    })),
    characters: CHARACTERS.map(character => {
      const holder = isCharacterExclusive(character)
        ? getLobbyEntryByCharacter(character)
        : null;
      return {
        name: character,
        taken: Boolean(holder),
        takenBy: holder?.playerId || null,
        offline: Boolean(holder?.character && !holder?.isBot && !holder?.socketId),
        takenByBot: Boolean(holder?.isBot),
        takenByName: holder?.character === 'custom' ? (holder.customName || 'Custom Player') : (holder?.name || holder?.character || null),
        customAvatarUrl: holder?.customAvatarUrl || null
      };
    }),
    boardOptions: BOARD_IDS.map(boardId => {
      const board = getBoardMapById(boardId);
      return {
        id: board.id,
        name: board.name,
        description: board.description || '',
        votes: boardVoteCounts[boardId] || 0,
        isSelected: boardId === selectedBoardId
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
    name: player?.name || null,
    customName: player?.customName || null,
    tokenId: player?.tokenId || null,
    customColor: player?.customColor || null,
    customAvatarUrl: player?.customAvatarUrl || null
  });
}

function getViewerTrades(playerId) {
  if (!playerId) return [];
  return [...pendingTrades.values()]
    .filter(trade => trade.toId === playerId || trade.fromId === playerId)
    .map(trade => ({ ...trade }));
}

function nextStateSequence() {
  stateSequence += 1;
  return stateSequence;
}

function snapshotGameState(options = {}) {
  if (!gameState) return null;
  const snapshotOptions = {
    includeCustomAvatarUrl: options.includeCustomAvatarUrl === true,
    includeHistoryEvents: options.includeHistoryEvents === true,
    includePropertyHistory: options.includePropertyHistory === true,
    includePropertyStatic: options.includePropertyStatic !== false
  };
  return {
    ...gameState.getState(snapshotOptions),
    stateSequence: nextStateSequence()
  };
}

function buildGameStatePayload(viewerPlayerId = null, options = {}) {
  const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
  const selectedBoardId = syncSelectedBoardId(roomState);
  const board = getBoardMapById(selectedBoardId);
  const payload = gameState ? snapshotGameState(options) : {
    players: [],
    properties: [],
    currentPlayerIndex: 0,
    currentPlayerId: null,
    isGameStarted: false,
    hasPendingExtraRoll: false,
    turnPhase: 'waiting',
    taxPool: 0,
    turnTimer: null,
    matchStartedAt: null,
    matchEndedAt: null,
    turnCount: 0,
    pauseState: null,
    eliminationOrder: [],
    stateSequence: nextStateSequence()
  };

  payload.auctionState = auctionState ? { ...auctionState } : null;
  if (viewerPlayerId) {
    payload.pendingTrades = getViewerTrades(viewerPlayerId);
  }
  payload.historyEvents = options.includeHistoryEvents === true ? [...eventHistory] : null;
  payload.roomCode = currentRoomCode;
  payload.joinUrl = currentRoomCode ? `/?room=${currentRoomCode}` : null;
  payload.boardId = board.id;
  payload.boardName = board.name;
  payload.turnTimerEnabled = isTurnTimerEnabled(roomState);
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
    boardId: resolveBoardId(rooms.get(currentRoomCode)?.selectedBoardId),
    turnTimerEnabled: isTurnTimerEnabled(),
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
        name: player.name,
        color: player.color,
        tokenId: player.tokenId,
        sessionToken: player.sessionToken,
        customAvatarUrl: player.customAvatarUrl,
        customColor: player.customColor,
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
  const restoredBoardId = resolveBoardId(saveState?.boardId || payload?.boardId);
  const restoredBoardData = getBoardTiles(restoredBoardId);

  if (!payload || !Array.isArray(payload.players) || !Array.isArray(payload.properties)) {
    throw new Error('Invalid save file format.');
  }

  const restored = new GameState(restoredBoardData);
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
        tokenId: resolveLobbyToken(playerData.character || lobbyEntry?.character, playerData.tokenId),
        customAvatarUrl: playerData.customAvatarUrl || lobbyEntry?.customAvatarUrl || null,
        customColor: playerData.customColor || lobbyEntry?.customColor || null,
        name: playerData.name || lobbyEntry?.customName || lobbyEntry?.name || playerData.character || lobbyEntry?.character || `Player ${index + 1}`
      }
    );

    restoredPlayer.socketId = lobbyEntry?.socketId || null;
    restoredPlayer.position = clampInt(playerData.position, 0, restoredBoardData.length - 1) ?? 0;
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
    restoredPlayer.pendingPostDebtPhase = normalizePendingPostDebtPhase(playerData.pendingPostDebtPhase);
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
  restored.turnPhase = TURN_TIMER_PHASES.has(payload.turnPhase)
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
    restoredBoardId,
    restoredGameState: restored,
    restoredActionDeck: Array.isArray(saveState?.actionDeck) ? [...saveState.actionDeck] : [...ACTION_CARDS],
    restoredEventHistory: Array.isArray(saveState?.eventHistory) ? [...saveState.eventHistory] : [],
    restoredLastDiceTotal: Number.isFinite(saveState?.lastDiceTotal) ? saveState.lastDiceTotal : 0,
    restoredTurnTimerState: saveState?.turnTimerState ? { ...saveState.turnTimerState } : null,
    restoredTurnTimerEnabled: saveState?.turnTimerEnabled !== false
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
    const roomState = currentRoomCode ? rooms.get(currentRoomCode) : null;
    roomState?.boardVotes?.clear();
    if (roomState) {
      roomState.selectedBoardId = DEFAULT_BOARD_ID;
    }
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
  let shouldAnnounceResume = false;

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
      roomState.boardVotes?.delete(lobbyEntry.sessionToken);
      syncSelectedBoardId(roomState);
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
        shouldAnnounceResume = true;
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

      if (shouldAnnounceResume && gameState?.isGameStarted && !gameState.pauseState) {
        emitToRoom('game-resumed', { gameState: snapshotGameState() });
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

function isTurnTimerEnabled(roomState = null) {
  const resolvedRoomState = roomState || (currentRoomCode ? rooms.get(currentRoomCode) : null);
  return resolvedRoomState?.turnTimerEnabled !== false;
}

function getTurnTimerIdleSeconds(phase) {
  return TURN_TIMER_IDLE_SECONDS[phase] || TURN_TIMER_IDLE_SECONDS.waiting;
}

function getTurnTimerActiveSeconds(phase) {
  return TURN_TIMER_ACTIVE_SECONDS[phase] || TURN_TIMER_ACTIVE_SECONDS.waiting;
}

function normalizeTurnTimerSeconds(value, fallbackSeconds) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallbackSeconds;
  return Math.max(1, parsed);
}

function extendCurrentTurnTimer(secondsToAdd, phase = turnTimerState?.phase) {
  if (!turnTimerState || !TURN_TIMER_PHASES.has(phase)) return null;

  const parsedSeconds = Number.parseInt(secondsToAdd, 10);
  const extensionSeconds = Number.isNaN(parsedSeconds)
    ? HOST_TIMER_EXTENSION_DEFAULT_SECONDS
    : Math.max(1, parsedSeconds);

  const maxSeconds = Math.max(HOST_TIMER_EXTENSION_MAX_SECONDS, getTurnTimerActiveSeconds(phase));
  const normalizedCurrentSeconds = normalizeTurnTimerSeconds(
    turnTimerState.remainingSeconds,
    getTurnTimerIdleSeconds(phase)
  );
  const nextSeconds = Math.min(maxSeconds, normalizedCurrentSeconds + extensionSeconds);
  const addedSeconds = nextSeconds - normalizedCurrentSeconds;

  turnTimerState.remainingSeconds = nextSeconds;
  syncTurnTimerState(turnTimerState);
  if (addedSeconds > 0) {
    emitToRoom('turn-timer-tick', gameState?.turnTimer || turnTimerState);
  }

  return {
    addedSeconds,
    maxSeconds,
    remainingSeconds: nextSeconds
  };
}

function maybeExtendTurnTimerForActivity(playerId) {
  if (!gameState || !turnTimerState || !playerId || gameState.pauseState || auctionState || !isTurnTimerEnabled()) return false;

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isActive || currentPlayer.id !== playerId) return false;
  if (!TURN_TIMER_PHASES.has(gameState.turnPhase)) return false;
  if (turnTimerState.currentPlayerId !== playerId || turnTimerState.phase !== gameState.turnPhase) return false;

  const boostedSeconds = getTurnTimerActiveSeconds(gameState.turnPhase);
  if (turnTimerState.remainingSeconds >= boostedSeconds) return false;

  turnTimerState.remainingSeconds = boostedSeconds;
  syncTurnTimerState(turnTimerState);
  emitToRoom('turn-timer-tick', gameState.turnTimer);
  return true;
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
      isTurnTimerEnabled()
      &&
      TURN_TIMER_PHASES.has(gameState.turnPhase)
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
    targetSocket.emit('game-state-sync', buildGameStatePayload(
      player?.id || targetSocket.data.playerId || null,
      {
        includeCustomAvatarUrl: true,
        includeHistoryEvents: true,
        includePropertyHistory: true,
        includePropertyStatic: true
      }
    ));
    return;
  }

  emitToRoom('game-state-sync', buildGameStatePayload(null, {
    includeCustomAvatarUrl: false,
    includeHistoryEvents: false,
    includePropertyHistory: false,
    includePropertyStatic: false
  }));
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

function startTurnTimer(phase, remainingSeconds = null) {
  if (!gameState || !gameState.isGameStarted || auctionState || gameState.pauseState || !isTurnTimerEnabled()) {
    stopTurnTimer(false);
    return;
  }

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isActive || !TURN_TIMER_PHASES.has(phase)) {
    stopTurnTimer(false);
    return;
  }
  if (currentPlayer.bankruptcyDeadline) {
    stopTurnTimer(false);
    return;
  }

  const idleSeconds = getTurnTimerIdleSeconds(phase);
  const nextRemainingSeconds = normalizeTurnTimerSeconds(remainingSeconds, idleSeconds);

  if (turnTimerInterval) clearInterval(turnTimerInterval);

  turnTimerState = {
    currentPlayerId: currentPlayer.id,
    phase,
    remainingSeconds: nextRemainingSeconds
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
    character: player.name || player.character,
    pausedAt: Date.now(),
    phase: gameState.turnPhase,
    remainingSeconds: pausedTurnTimerState?.remainingSeconds ?? null
  };
  emitToRoom('game-paused', {
    pauseState: gameState.pauseState,
    gameState: snapshotGameState()
  });
}

function resumePausedGameIfPossible(player) {
  if (!gameState || !gameState.pauseState || !player) return;
  if (gameState.pauseState.reason !== 'player-disconnected') return;
  if (gameState.pauseState.playerId !== player.id) return;

  gameState.pauseState = null;
  const timerToResume = pausedTurnTimerState;
  pausedTurnTimerState = null;

  if (timerToResume && isTurnTimerEnabled() && TURN_TIMER_PHASES.has(gameState.turnPhase)) {
    startTurnTimer(gameState.turnPhase, timerToResume.remainingSeconds);
  } else {
    stopTurnTimer(false);
  }

  emitToRoom('game-resumed', { gameState: snapshotGameState() });
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

  if (TURN_TIMER_PHASES.has(phase)) {
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
    gameState: snapshotGameState()
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
          logEvent(`💰 ${seller.name} received $${finishedAuction.currentBid} from the auction of ${tile.name}`, 'buy');
        }
      }
      logEvent(`🔨 ${winner.name} won ${tile.name} for $${finishedAuction.currentBid}!`, 'auction');
    }
  } else {
    logEvent(`🔨 No bids on ${tile.name}. Property remains unowned.`, 'auction');
  }

  auctionState = null;
  invalidateStaleTrades();

  emitToRoom('auction-ended', {
    winnerId: winner?.id || null,
    winnerCharacter: winner?.name || winner?.character || null,
    bid: finishedAuction.currentBid,
    tileName: finishedAuction.tileName,
    tileIndex: finishedAuction.tileIndex,
    gameState: snapshotGameState()
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

  const pendingPostDebtPhase = normalizePendingPostDebtPhase(currentPlayer.pendingPostDebtPhase);
  const nextPhase = finishedAuction.returnPhase === 'waiting' && pendingPostDebtPhase
    ? pendingPostDebtPhase
    : finishedAuction.returnPhase;

  if (!(currentPlayer.bankruptcyDeadline || currentPlayer.money < 0) && nextPhase === pendingPostDebtPhase) {
    currentPlayer.pendingPostDebtPhase = null;
  }

  setTurnPhase(nextPhase === 'done' ? 'done' : 'waiting');
  emitCurrentTurnChanged(currentPlayer);
  if (nextPhase === 'done') {
    queueBotEndTurnIfNeeded(currentPlayer);
    return;
  }
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
  auctionState.currentBidderCharacter = playerRecord.name || playerRecord.character;
  auctionState.timeRemaining = auctionState.bidResetSeconds || AUCTION_BID_RESET_SECONDS;
  auctionState.timerMaxSeconds = auctionState.bidResetSeconds || AUCTION_BID_RESET_SECONDS;

  logEvent(`🔨 ${playerRecord.name} bid $${amount} on ${auctionState.tileName}`, 'bid');
  emitToRoom('auction-bid', {
    bidderId: playerRecord.id,
    bidderCharacter: playerRecord.name || playerRecord.character,
    amount,
    timeRemaining: auctionState.timeRemaining,
    auction: auctionState,
    gameState: snapshotGameState()
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

  console.log(`✦ Turn passes to ${nextPlayer.name}`);
  setTurnPhase('waiting');
  if (!nextPlayer.isConnected) {
    pauseGameForDisconnect(nextPlayer);
  }
  emitToRoom('turn-changed', {
    currentPlayerId: nextPlayer.id,
    currentCharacter: nextPlayer.name || nextPlayer.character,
    gameState: snapshotGameState()
  });
  queueBotTurnIfNeeded(nextPlayer);
}

function shouldKeepTurnForDoubles(player = gameState?.getCurrentPlayer()) {
  return Boolean(
    gameState
    && player
    && player.isActive
    && gameState.getCurrentPlayer()?.id === player.id
    && gameState.hasPendingExtraRoll()
    && !player.inJail
  );
}

function normalizePendingPostDebtPhase(value) {
  return ['waiting', 'done', 'buying'].includes(value) ? value : null;
}

function getPendingPostDebtPhaseForPlayer(player = gameState?.getCurrentPlayer()) {
  if (!player || !gameState) return 'waiting';
  return shouldKeepTurnForDoubles(player) ? 'waiting' : 'done';
}

function emitCurrentTurnChanged(player = gameState?.getCurrentPlayer()) {
  if (!gameState || !player) return;

  emitToRoom('turn-changed', {
    currentPlayerId: player.id,
    currentCharacter: player.name || player.character,
    gameState: snapshotGameState()
  });
}

function waitForTurnEndCurrentPlayer() {
  if (!gameState) return;

  clearPendingMoveResolution();
  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || !currentPlayer.isActive) {
    advanceTurnGlobal();
    return;
  }

  if (shouldKeepTurnForDoubles(currentPlayer)) {
    setTurnPhase('waiting');
    emitCurrentTurnChanged(currentPlayer);
    queueBotTurnIfNeeded(currentPlayer);
    return;
  }

  setTurnPhase('done');
  if (!currentPlayer.isConnected) {
    pauseGameForDisconnect(currentPlayer);
  }
  emitCurrentTurnChanged(currentPlayer);
  queueBotEndTurnIfNeeded(currentPlayer);
}

function resolveDevTeleport(player) {
  if (!gameState || !player) return;

  const currentPlayer = gameState.getCurrentPlayer();
  if (!currentPlayer || currentPlayer.id !== player.id) {
    return;
  }

  clearPendingMoveResolution();
  gameState.doublesCount = 0;

  const landingTile = gameState.properties[player.position];
  const diceTotal = landingTile?.type === 'utility'
    ? 7
    : (typeof lastDiceTotal === 'number' ? lastDiceTotal : 0);

  setTurnPhase('waiting');

  const result = evaluateTile(player, diceTotal, {});
  if (result === 'buying' || result === 'pending' || result === 'recovery') {
    return;
  }

  if (result === 'bankrupt') {
    if (gameState.getActivePlayers().length > 1) {
      advanceTurnGlobal();
    }
    return;
  }

  waitForTurnEndCurrentPlayer();
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
  tile.addHistory(historyType, player.name || player.character, player.color, price);
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
  logEvent(`🏆 ${winner.name} WINS THE GAME!`, 'win');
  emitToRoom('game-over', {
    winner: winner.toJSON(),
    summary,
    gameState: snapshotGameState()
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
    player.pendingPostDebtPhase = getPendingPostDebtPhaseForPlayer(player);
    setTurnPhase('waiting', { restartTimer: false });
  }

  if (!alreadyInRecovery) {
    logEvent(`⚠️ ${player.name} is in debt ($${player.money})! Recover before ending the turn or declare bankruptcy.`, 'bankrupt');
  }
  emitToRoom('bankruptcy-warning', {
    playerId: player.id,
    character: player.character,
    money: player.money,
    gameState: snapshotGameState()
  });

  emitGameStateSync({ restartTurnTimer: false });
  return 'warning';
}

function checkBankruptcyRecovery(player) {
  if (!player?.bankruptcyDeadline || !player.isActive) return;

  if (player.money >= 0) {
    const isCurrentPlayer = gameState?.getCurrentPlayer()?.id === player.id;
    const pendingPostDebtPhase = normalizePendingPostDebtPhase(player.pendingPostDebtPhase);
    player.bankruptcyDeadline = null;
    if (!isCurrentPlayer || !(auctionState || gameState?.pauseState)) {
      player.pendingPostDebtPhase = null;
    }

    logEvent(`✅ ${player.name} recovered from debt!`, 'system');
    emitToRoom('bankruptcy-resolved', {
      playerId: player.id,
      character: player.character,
      survived: true,
      gameState: snapshotGameState()
    });

    if (isCurrentPlayer && pendingPostDebtPhase && !auctionState && !gameState?.pauseState) {
      setTurnPhase(pendingPostDebtPhase);
      emitCurrentTurnChanged(player);
      if (pendingPostDebtPhase === 'done') {
        queueBotEndTurnIfNeeded(player);
      } else if (pendingPostDebtPhase === 'waiting') {
        queueBotTurnIfNeeded(player);
      }
    }
  }
}

function executeBankruptcy(player) {
  if (!gameState || !player || !player.isActive) return;

  if (pendingMoveResolution?.playerId === player.id) {
    clearPendingMoveResolution();
  }

  player.bankruptcyDeadline = null;
  player.pendingPostDebtPhase = null;

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
    message: `${player.name} is bankrupt, so the trade can no longer continue.`
  });

  logEvent(`💀 ${player.name} went BANKRUPT!`, 'bankrupt');
  emitToRoom('player-bankrupt', {
    playerId: player.id,
    character: player.character,
    returnedProperties: returnedProps,
    gameState: snapshotGameState()
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
      gameState: snapshotGameState()
    });
  }
  emitToRoom('player-deciding', { character: player.character, tileName: tile.name });
  queueBotBuyDecision(player, tile);
}

function resolveActionCardAndMaybeMove(player) {
  // #27: Lucky Wheel removes 'roll again' doubles bonus
  if (lastDiceTotal && lastDiceTotal.isDoubles) {
      lastDiceTotal.isDoubles = false;
      gameState.doublesCount = 0;
  }
  const card = drawActionCard();
  player.stats.cardsDrawn++;
  logEvent(`🃏 ${player.name}: "${card.text}"`, 'card');

  // Card text already describes the effect; avoid a second card-line for the same action.
  const result = CardUtils.resolveActionCard(gameState, player, card);

  if (result.moveResult) {
    recordMoveStats(player, result.moveResult);
  }
  if (result.sentToJail) {
    gameState.doublesCount = 0;
    player.stats.jailVisits++;
  }

  emitToRoom('card-drawn', {
    playerId: player.id,
    character: player.character,
    playerName: player.name,
    card,
    result,
    gameState: snapshotGameState()
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
      logEvent(`💰 ${player.name} collected the $${collected} Bailout fund!`, 'buy');
      logPlayerMoneyDelta(player, collected, 'from the Bailout fund', 'buy');
  emitToRoom('bailout-collected', {
        playerId: player.id,
        character: player.character,
        playerName: player.name,
        amount: collected,
        gameState: snapshotGameState()
      });
    }
    return 'done';
  }

  if (player.position === 30) {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    gameState.doublesCount = 0;
    player.stats.jailVisits++;
    logEvent(`🚔 ${player.name} was sent to Jail!`, 'tax');
  emitToRoom('sent-to-jail', {
      playerId: player.id,
      character: player.character,
      playerName: player.name,
      gameState: snapshotGameState()
    });
    return 'done';
  }

  if (tile.type === 'tax') {
    const taxAmount = Rules.calculateTaxAmount(tile, player);
    player.money -= taxAmount;
    gameState.taxPool += taxAmount;
    logEvent(`💸 ${player.name} paid $${taxAmount} in ${tile.name}`, 'tax');
  emitToRoom('tax-paid', {
      playerId: player.id,
      character: player.character,
      playerName: player.name,
      amount: taxAmount,
      tileName: tile.name,
      gameState: snapshotGameState()
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
        tile.addHistory('rent', player.name, player.color, rent);
        logEvent(`💰 ${player.name} paid $${rent} rent to ${owner.name} for ${tile.name}`, 'rent');
  emitToRoom('rent-paid', {
          payerId: player.id,
          payerCharacter: player.character,
          ownerId: owner.id,
          ownerCharacter: owner.character,
          ownerName: owner.name,
          amount: rent,
          tileName: tile.name,
          gameState: snapshotGameState()
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

  const scheduledResolution = pendingMoveResolution;
  if (!scheduledResolution || scheduledResolution.playerId !== playerId) {
    return;
  }

  const resolution = scheduledResolution.resolution || { action: 'evaluate', diceTotal: lastDiceTotal, rentContext: {} };
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
      gameState.doublesCount = 0;
      logEvent(`🔓 ${currentPlayer.name} rolled doubles and escaped jail!`, 'roll');
      // #7: Escaping jail by rolling doubles ends the turn (no move this turn)
      emitToRoom('dice-rolled', {
        playerId,
        character: currentPlayer.character,
        playerName: currentPlayer.name,
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
        gameState: snapshotGameState(),
        jailRoll: true
      });
      // End turn after escaping jail — next turn they roll normally
      scheduleMoveResolution(playerId, 0, 0, { action: 'finish-turn' });
      return true;
    } else {
      currentPlayer.jailTurns++;
      if (currentPlayer.jailTurns >= 3) {
        // After 3 failed rolls, the player is released for free.
        currentPlayer.inJail = false;
        currentPlayer.jailTurns = 0;
        logEvent(`🔓 ${currentPlayer.name} was released from jail after 3 failed rolls.`, 'roll');
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
          gameState: snapshotGameState(),
          jailRoll: true
        });
        scheduleMoveResolution(playerId, 0, 0, { action: 'finish-turn' });
        return true;
      } else {
        logEvent(`🔒 ${currentPlayer.name} failed to roll doubles (jail turn ${currentPlayer.jailTurns}/3)`, 'roll');
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
          gameState: snapshotGameState(),
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
  logEvent(`🎲 ${currentPlayer.name} rolled ${diceResult.total} and went to ${tileName}${diceResult.isDoubles ? ' (DOUBLES!)' : ''}`, 'roll');

  emitToRoom('dice-rolled', {
    playerId,
    character: currentPlayer.character,
    playerName: currentPlayer.name,
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
    gameState: snapshotGameState()
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
      logEvent(`⏰ ${currentPlayer.name} ran out of time on ${tile.name}. Skipping the auction.`, 'system');
    } else {
      logEvent(`⏰ ${currentPlayer.name} ran out of time on ${tile.name}. Starting auction.`, 'system');
    }
  } else {
    logEvent(`⏭️ ${currentPlayer.name} passed on ${tile.name}`, 'pass');
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
  logEvent(`🏠 ${currentPlayer.name} bought ${tile.name} for $${tile.price}`, 'buy');
  invalidateStaleTrades();

  emitToRoom('property-bought', {
    playerId: currentPlayer.id,
    character: currentPlayer.character,
    tileIndex: tile.index,
    tileName: tile.name,
    price: tile.price,
    gameState: snapshotGameState()
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

function performBotJailAction(player) {
  if (!gameState || !player?.isBot || !player.inJail) return false;
  if (gameState.getCurrentPlayer()?.id !== player.id || gameState.turnPhase !== 'waiting') return false;

  if (player.pardons > 0 && (player.jailTurns >= 1 || player.money < 220 || Math.random() < 0.4)) {
    player.pardons--;
    player.inJail = false;
    player.jailTurns = 0;
    logEvent(`🃏 ${player.character} used a Pardon Card to leave jail!`, 'card');

    emitToRoom('jail-state-changed', {
      playerId: player.id,
      character: player.character,
      inJail: false,
      gameState: snapshotGameState()
    });

    waitForTurnEndCurrentPlayer();
    return true;
  }

  if (player.money >= 50 && (player.jailTurns >= 2 || Math.random() < 0.35)) {
    player.money -= 50;
    gameState.taxPool += 50;
    player.inJail = false;
    player.jailTurns = 0;
    gameState.doublesCount = 0;
    logEvent(`🔓 ${player.character} paid $50 to leave jail and must end the turn.`, 'tax');
    invalidateStaleTrades();

    emitToRoom('jail-state-changed', {
      playerId: player.id,
      character: player.character,
      inJail: false,
      gameState: snapshotGameState()
    });

    waitForTurnEndCurrentPlayer();
    return true;
  }

  return false;
}

function performBotDebtRecoveryStep(player) {
  if (!gameState || !player?.isBot || !player.isActive) return false;
  if (!(player.bankruptcyDeadline || player.money < 0)) return false;

  const downgradeCandidates = gameState.properties
    .filter(tile => tile.owner === player.id && tile.type === 'property' && (tile.houses || 0) > 0)
    .sort((left, right) => (right.houses || 0) - (left.houses || 0));

  for (const tile of downgradeCandidates) {
    const validation = Rules.validateDowngrade(gameState.properties, player.id, tile.index);
    if (!validation.ok) continue;

    const refund = Math.floor(tile.price * 0.25);
    player.money += refund;
    player.stats.housesSold++;
    tile.houses--;
    logEvent(`🔻 ${player.character} sold a house on ${tile.name} (+$${refund})`, 'sell');
    invalidateStaleTrades();
    checkBankruptcyRecovery(player);

    emitToRoom('property-downgraded', {
      playerId: player.id,
      character: player.character,
      tileIndex: tile.index,
      tileName: tile.name,
      houses: tile.houses,
      refund,
      gameState: snapshotGameState()
    });
    return true;
  }

  const mortgageCandidates = gameState.properties
    .filter(tile => tile.owner === player.id && !tile.isMortgaged && !Rules.isGroupAssetLocked(gameState.properties, tile))
    .sort((left, right) => (right.price || 0) - (left.price || 0));

  for (const tile of mortgageCandidates) {
    tile.isMortgaged = true;
    const mortgageValue = Math.floor(tile.price / 2);
    player.money += mortgageValue;
    logEvent(`🏦 ${player.character} mortgaged ${tile.name} (+$${mortgageValue})`, 'sell');
    invalidateStaleTrades();
    checkBankruptcyRecovery(player);

    emitToRoom('property-mortgaged', {
      playerId: player.id,
      character: player.character,
      tileIndex: tile.index,
      tileName: tile.name,
      mortgageValue,
      gameState: snapshotGameState()
    });
    return true;
  }

  const sellCandidates = gameState.properties
    .filter(tile => tile.owner === player.id && !Rules.isGroupAssetLocked(gameState.properties, tile))
    .sort((left, right) => (right.price || 0) - (left.price || 0));

  for (const tile of sellCandidates) {
    const sellValue = Math.floor(tile.price * 0.5) + ((tile.houses || 0) * Math.floor(tile.price * 0.25));
    player.money += sellValue;
    tile.owner = null;
    tile.houses = 0;
    tile.isMortgaged = false;
    player.properties = player.properties.filter(index => index !== tile.index);
    logEvent(`💰 ${player.character} sold ${tile.name} to the bank (+$${sellValue})`, 'sell');
    invalidateStaleTrades();
    checkBankruptcyRecovery(player);

    emitToRoom('property-sold', {
      playerId: player.id,
      character: player.character,
      tileIndex: tile.index,
      tileName: tile.name,
      sellValue,
      gameState: snapshotGameState()
    });
    return true;
  }

  if (player.money < 0) {
    executeBankruptcy(player);
    return true;
  }

  return false;
}

function performBotUpgradeStep(player) {
  if (!gameState || !player?.isBot || !player.isActive) return false;
  if (!canPlayerManageAssets(player.id)) return false;
  if (player.inJail || player.bankruptcyDeadline || player.money < 0) return false;

  const upgradeOptions = gameState.properties
    .filter(tile => tile.owner === player.id && tile.type === 'property')
    .map(tile => {
      const validation = Rules.validateUpgrade(gameState.properties, player.id, tile.index);
      if (!validation.ok) return null;

      const cost = Math.floor(tile.price * 0.5);
      const reserve = tile.houses >= 3 ? 220 : 160;
      if (player.money - cost < reserve) return null;

      let score = (tile.houses || 0) * 10;
      if (wouldOwnFullColorGroup(player.id, tile)) score += 25;
      score += Math.floor((tile.price || 0) / 40);
      return { tile, cost, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score);

  if (!upgradeOptions.length) return false;
  if (Math.random() > 0.65) return false;

  const { tile, cost } = upgradeOptions[0];
  player.money -= cost;
  player.stats.housesBuilt++;
  tile.houses++;
  const label = tile.houses >= 5 ? 'Hotel' : `House ${tile.houses}`;
  logEvent(`🏗️ ${player.character} built ${label} on ${tile.name} ($${cost})`, 'buy');
  invalidateStaleTrades();

  emitToRoom('property-upgraded', {
    playerId: player.id,
    character: player.character,
    tileIndex: tile.index,
    tileName: tile.name,
    houses: tile.houses,
    cost,
    gameState: snapshotGameState()
  });
  return true;
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
    tile.addHistory('trade', accepter.name || accepter.character, accepter.color, 0);
  });
  trade.requestProperties.forEach(index => {
    const tile = gameState.properties[index];
    if (!tile || tile.owner !== accepter.id) return;
    tile.owner = offerer.id;
    tile.addHistory('trade', offerer.name || offerer.character, offerer.color, 0);
  });

  offerer.stats.tradesCompleted++;
  accepter.stats.tradesCompleted++;
  checkBankruptcyRecovery(offerer);
  checkBankruptcyRecovery(accepter);
  syncPlayerPropertyLists();
  removePendingTrade(trade.id);
  invalidateStaleTrades();
  maybeExtendTurnTimerForActivity(accepter.id);

  logEvent(`✅ ${accepter.name || accepter.character} accepted trade with ${offerer.name || offerer.character}!`, 'trade');
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
    fromCharacter: offerer.name || offerer.character,
    toCharacter: accepter.name || accepter.character,
    gameState: snapshotGameState()
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
    logEvent(`❌ ${liveBot.name || liveBot.character} rejected trade from ${offerer.name || offerer.character}`, 'trade');
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

    if (performBotJailAction(currentPlayer)) {
      return;
    }

    if (currentPlayer.bankruptcyDeadline || currentPlayer.money < 0) {
      const acted = performBotDebtRecoveryStep(currentPlayer);
      if (!currentPlayer.isActive) {
        if (gameState && gameState.getActivePlayers().length > 1) {
          advanceTurnGlobal();
        }
        return;
      }

      if (acted) {
        queueBotTurnIfNeeded(currentPlayer);
        return;
      }
    }

    if (performBotUpgradeStep(currentPlayer)) {
      queueBotTurnIfNeeded(currentPlayer);
      return;
    }

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

  const tile = gameState.properties[auctionState.tileIndex];
  if (!tile) return;

  const minimumBid = auctionState.currentBid + 1;
  const bots = gameState
    .getActivePlayers()
    .filter(player => player.isBot && player.id !== auctionState.currentBidderId);

  bots.forEach(bot => {
    const bidCap = getBotBidCap(bot, tile);
    if (bidCap < minimumBid) return;

    let bidChance = 0.45;
    if (wouldOwnFullColorGroup(bot.id, tile)) bidChance += 0.3;
    if (tile.type === 'railroad') bidChance += 0.08;
    if (tile.type === 'utility') bidChance -= 0.05;
    if (bot.money < 250) bidChance -= 0.25;
    bidChance = Math.max(0.15, Math.min(0.9, bidChance));
    if (Math.random() > bidChance) return;

    const increment = BOT_BID_INCREMENTS[Math.floor(Math.random() * BOT_BID_INCREMENTS.length)];
    const desiredBid = Math.min(bidCap, Math.max(minimumBid, auctionState.currentBid + increment));

    scheduleBotTimer(`auction:${bot.id}`, randomBotDelay(350, 1200), () => {
      if (!gameState || !auctionState || gameState.pauseState) return;

      const liveBot = gameState.getPlayerById(bot.id);
      const liveTile = gameState.properties[auctionState.tileIndex];
      if (!liveBot || !liveBot.isActive || !liveBot.isBot || !liveTile) return;
      if (auctionState.currentBidderId === liveBot.id) return;

      const liveMinimumBid = auctionState.currentBid + 1;
      const liveCap = getBotBidCap(liveBot, liveTile);
      if (liveCap < liveMinimumBid) return;

      const nextBid = Math.min(liveCap, Math.max(liveMinimumBid, desiredBid));
      handlePlaceBid(liveBot.id, nextBid);
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
    const hasCustomPayload = characterName === 'custom' && typeof data === 'object';
    const customName = hasCustomPayload ? normalizeCustomName(data?.customName) : '';
    const { avatarUrl: customAvatarUrl, error: customAvatarError } = hasCustomPayload
      ? normalizeCustomAvatarUrl(data?.customAvatarUrl)
      : { avatarUrl: null, error: null };

    if (gameState && gameState.isGameStarted) {
      socket.emit('character-error', { message: 'Game already in progress' });
      return;
    }
    if (!CHARACTERS.includes(characterName)) {
      socket.emit('character-error', { message: 'Invalid character' });
      return;
    }
    if (customAvatarError) {
      socket.emit('character-error', { message: customAvatarError });
      return;
    }

    const currentEntry = getOrCreateLobbyEntry(socket);
    const holder = isCharacterExclusive(characterName) ? getLobbyEntryByCharacter(characterName) : null;
    if (holder && holder.sessionToken !== currentEntry.sessionToken) {
      socket.emit('character-taken', { character: characterName, message: 'Character already taken' });
      return;
    }

    currentEntry.character = characterName;
    currentEntry.tokenId = resolveLobbyToken(characterName, currentEntry.tokenId);

    if (characterName === 'custom') {
      currentEntry.customName = customName || 'Custom Player';
      currentEntry.customAvatarUrl = customAvatarUrl;
      currentEntry.name = currentEntry.customName;
    } else {
      currentEntry.name = characterName;
      delete currentEntry.customName;
      delete currentEntry.customAvatarUrl;
    }

    if (customColor) currentEntry.customColor = customColor;
    else delete currentEntry.customColor;
    currentEntry.socketId = socket.id;
    socket.data.playerId = currentEntry.playerId;
    socket.emit('character-confirmed', {
      character: characterName,
      tokenId: currentEntry.tokenId,
      customColor: currentEntry.customColor || null,
      customName: currentEntry.customName || null,
      customAvatarUrl: currentEntry.customAvatarUrl || null
    });
    emitPlayerSession(socket, {
      id: currentEntry.playerId,
      character: characterName,
      name: currentEntry.name,
      customName: currentEntry.customName || null,
      tokenId: currentEntry.tokenId,
      customColor: currentEntry.customColor || null,
      customAvatarUrl: currentEntry.customAvatarUrl || null
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
      name: currentEntry.name,
      customName: currentEntry.customName || null,
      tokenId: currentEntry.tokenId,
      customColor: currentEntry.customColor || null,
      customAvatarUrl: currentEntry.customAvatarUrl || null
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
      name: entry.name,
      customName: entry.customName || null,
      tokenId: entry.tokenId || null,
      customColor: entry.customColor || null,
      customAvatarUrl: entry.customAvatarUrl || null
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
      name: null,
      customName: entry.customName || null,
      tokenId: null,
      customColor: entry.customColor || null,
      customAvatarUrl: entry.customAvatarUrl || null
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

  bindRoomHandler(socket, roomState, 'vote-board-map', data => {
    if (gameState && gameState.isGameStarted) {
      socket.emit('game-error', { message: 'Map voting is only available in the lobby.' });
      return;
    }

    const sessionToken = socket.data.sessionToken;
    const lobbyEntry = lobbyPlayers.get(sessionToken);
    if (!sessionToken || !lobbyEntry || lobbyEntry.isBot) {
      return;
    }

    const requestedBoardId = resolveBoardId(typeof data === 'string' ? data : data?.boardId);
    if (roomState.boardVotes.get(sessionToken) === requestedBoardId) {
      return;
    }

    roomState.boardVotes.set(sessionToken, requestedBoardId);
    syncSelectedBoardId(roomState);
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

    const selectedBoardId = syncSelectedBoardId(roomState);
    gameState = new GameState(getBoardTiles(selectedBoardId));
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
    gameState.players = [];
    readyPlayers.forEach((p, idx) => {
      const customIndex = readyPlayers
        .slice(0, idx)
        .filter(entry => entry.character === 'custom')
        .length;
      const color = getDefaultColorForLobbyEntry(p, customIndex);
      const player = gameState.addPlayer(p.playerId, p.character, color, p.sessionToken, {
        isBot: Boolean(p.isBot),
        name: p.customName || p.character,
        customAvatarUrl: p.customAvatarUrl,
        customColor: p.customColor || null,
        tokenId: resolveLobbyToken(p.character, p.tokenId),
        isConnected: Boolean(p.isBot || p.socketId)
      });

      if (p.socketId) {
        const targetSocket = io.sockets.sockets.get(p.socketId);
        if (targetSocket) {
          replaceSocketBinding(targetSocket, player);
        }
      }
    });

    gameState.isGameStarted = true;
    gameState.matchStartedAt = Date.now();
    gameState.matchEndedAt = null;
    gameState.turnCount = 0;
    gameState.pauseState = null;
    gameState.eliminationOrder = [];

    setTurnPhase('waiting');

    console.log(`\n  🎮 Game started with ${readyPlayers.length} players!\n`);
    logEvent(`🎮 Game started with ${readyPlayers.length} players!`, 'system');
    emitToRoom('gameStarted', buildGameStatePayload(null, {
      includeHistoryEvents: true,
      includePropertyHistory: true,
      includePropertyStatic: true
    }));
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

  bindRoomHandler(socket, roomState, 'host-set-turn-timer-enabled', data => {
    if (!isRoomHost(socket, roomState)) {
      socket.emit('game-error', { message: 'Only the room host can change timer settings.' });
      return;
    }

    const nextEnabled = data?.enabled !== false;
    const previousEnabled = isTurnTimerEnabled(roomState);
    if (previousEnabled === nextEnabled) return;

    roomState.turnTimerEnabled = nextEnabled;

    if (!nextEnabled) {
      stopTurnTimer();
    } else if (
      gameState
      && gameState.isGameStarted
      && !gameState.pauseState
      && !auctionState
      && TURN_TIMER_PHASES.has(gameState.turnPhase)
      && !gameState.getCurrentPlayer()?.bankruptcyDeadline
    ) {
      startTurnTimer(gameState.turnPhase);
    }

    const hostPlayer = getSocketPlayer(socket)
      || gameState?.getPlayerBySessionToken(socket.data.sessionToken)
      || lobbyPlayers.get(socket.data.sessionToken)
      || null;
    logEvent(
      `⏱ ${hostPlayer?.name || hostPlayer?.character || 'The host'} ${nextEnabled ? 'enabled' : 'disabled'} the turn timer.`,
      'system'
    );

    emitLobbyUpdate();
    if (gameState && gameState.isGameStarted) {
      emitGameStateSync();
    }
  });

  bindRoomHandler(socket, roomState, 'host-extend-turn-timer', data => {
    if (!isRoomHost(socket, roomState)) {
      socket.emit('game-error', { message: 'Only the room host can extend the turn timer.' });
      return;
    }
    if (!gameState || !gameState.isGameStarted) {
      socket.emit('game-error', { message: 'There is no active match to extend.' });
      return;
    }
    if (!isTurnTimerEnabled(roomState)) {
      socket.emit('game-error', { message: 'Turn timer is disabled right now.' });
      return;
    }
    if (gameState.pauseState) {
      socket.emit('game-error', { message: 'Cannot extend timer while the game is paused.' });
      return;
    }
    if (!turnTimerState || !TURN_TIMER_PHASES.has(turnTimerState.phase)) {
      socket.emit('game-error', { message: 'No active turn timer to extend right now.' });
      return;
    }

    const extension = extendCurrentTurnTimer(data?.seconds, turnTimerState.phase);
    if (!extension) {
      socket.emit('game-error', { message: 'No active turn timer to extend right now.' });
      return;
    }
    if (extension.addedSeconds <= 0) {
      socket.emit('game-error', { message: `Turn timer is already capped at ${extension.maxSeconds}s.` });
      return;
    }

    const hostPlayer = getSocketPlayer(socket)
      || gameState?.getPlayerBySessionToken(socket.data.sessionToken)
      || lobbyPlayers.get(socket.data.sessionToken)
      || null;
    logEvent(
      `⏱ ${hostPlayer?.name || hostPlayer?.character || 'The host'} added ${extension.addedSeconds}s to the ${turnTimerState.phase} timer.`,
      'system'
    );
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

  bindRoomHandler(socket, roomState, 'jail-roll', () => {
    if (!gameState || !gameState.isGameStarted) return;
    if (auctionState) {
      socket.emit('game-error', { message: 'Auction in progress' });
      return;
    }

    const playerRecord = getSocketPlayer(socket);
    const currentPlayer = gameState.getCurrentPlayer();
    if (!playerRecord || !currentPlayer || currentPlayer.id !== playerRecord.id) {
      socket.emit('game-error', { message: 'You can only roll for doubles on your turn.' });
      return;
    }
    if (!playerRecord.inJail) {
      socket.emit('game-error', { message: 'You are not in jail.' });
      return;
    }
    if (!['waiting', 'done'].includes(gameState.turnPhase)) {
      socket.emit('game-error', { message: 'You cannot roll for doubles right now.' });
      return;
    }
    if (gameState.turnPhase === 'done') {
      setTurnPhase('waiting');
    }

    if (!handleRollDice(playerRecord.id)) {
      socket.emit('game-error', { message: 'You cannot roll for doubles right now.' });
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
    if (playerRecord.money < 50) {
      socket.emit('game-error', { message: 'Not enough money to buy out of jail ($50)' });
      return;
    }
    const currentPlayer = gameState.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerRecord.id) {
      socket.emit('game-error', { message: 'You can only buy out of jail on your turn.' });
      return;
    }

    playerRecord.money -= 50;
    gameState.taxPool += 50;
    playerRecord.inJail = false;
    playerRecord.jailTurns = 0;
    gameState.doublesCount = 0;
    logEvent(`🔓 ${playerRecord.character} paid $50 to leave jail and must end the turn.`, 'tax');
    invalidateStaleTrades();

    emitToRoom('jail-state-changed', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      inJail: false,
      gameState: snapshotGameState()
    });

    // Paying to leave jail ends the rolling option for this turn.
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
      gameState: snapshotGameState()
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
          resolveDevTeleport(playerRecord);
        } else {
          restartTurnTimer = gameState.getCurrentPlayer()?.isActive && TURN_TIMER_PHASES.has(gameState.turnPhase);
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
    trade.fromCharacter = from.name || from.character;
    const targetPlayer = gameState.getPlayerById(trade.toId);
    if (targetPlayer) {
      trade.toCharacter = targetPlayer.name || targetPlayer.character;
    }

    if (trade.counterToTradeId) {
      removePendingTrade(trade.counterToTradeId, {
        code: 'countered',
        message: `${from.name || from.character} replaced the original offer with a counter-offer.`
      });
    }

    pendingTrades.set(tradeId, trade);
    maybeExtendTurnTimerForActivity(from.id);
    logEvent(`🤝 ${from.name || from.character} offered a trade to ${trade.toCharacter}`, 'trade');
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
    maybeExtendTurnTimerForActivity(rejecter.id);
    const offerer = gameState.getPlayerById(trade.fromId);
    if (offerer) {
      logEvent(`❌ ${rejecter.name || rejecter.character} rejected trade from ${offerer.name || offerer.character}`, 'trade');
      io.to(getPlayerRoom(offerer.id)).emit('trade-rejected', {
        tradeId: trade.id,
        fromId: offerer.id,
        toId: rejecter.id
      });
    }
  });

  bindRoomHandler(socket, roomState, 'trade-cancel', data => {
    if (!gameState || !gameState.isGameStarted) return;

    const canceller = getSocketPlayer(socket);
    if (!canceller) return;

    const trade = pendingTrades.get(data.tradeId);
    if (!trade || trade.fromId !== canceller.id) return;

    removePendingTrade(trade.id);
    maybeExtendTurnTimerForActivity(canceller.id);
    const recipient = gameState.getPlayerById(trade.toId);
    if (recipient) {
      const cancellerName = canceller.name || canceller.character;
      logEvent(`↩️ ${cancellerName} cancelled a trade with ${recipient.name || recipient.character}`, 'trade');
      io.to(getPlayerRoom(recipient.id)).emit('trade-cancelled', {
        tradeId: trade.id,
        fromId: canceller.id,
        toId: recipient.id,
        message: `${cancellerName} cancelled the trade offer.`
      });
    }
    socket.emit('trade-cancelled', {
      tradeId: trade.id,
      fromId: canceller.id,
      toId: trade.toId,
      message: 'Trade offer cancelled.'
    });
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
    maybeExtendTurnTimerForActivity(playerRecord.id);

    emitToRoom('property-upgraded', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      houses: tile.houses,
      cost: upgradeCost,
      gameState: snapshotGameState()
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
    maybeExtendTurnTimerForActivity(playerRecord.id);

    emitToRoom('property-downgraded', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      houses: tile.houses,
      refund,
      gameState: snapshotGameState()
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
    maybeExtendTurnTimerForActivity(playerRecord.id);

    emitToRoom('property-mortgaged', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      mortgageValue,
      gameState: snapshotGameState()
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
    maybeExtendTurnTimerForActivity(playerRecord.id);

    emitToRoom('property-unmortgaged', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      cost: unmortgageCost,
      gameState: snapshotGameState()
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
    maybeExtendTurnTimerForActivity(playerRecord.id);

    emitToRoom('property-sold', {
      playerId: playerRecord.id,
      character: playerRecord.character,
      tileIndex: tile.index,
      tileName: tile.name,
      sellValue,
      gameState: snapshotGameState()
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
      roomState.selectedBoardId = restored.restoredBoardId;
      roomState.turnTimerEnabled = restored.restoredTurnTimerEnabled;
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
      emitLobbyUpdate();
      emitToRoom('game-loaded', { gameState: snapshotGameState({
        includeHistoryEvents: true,
        includePropertyHistory: true,
        includePropertyStatic: true
      }) });
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
      roomState.boardVotes?.delete(lobbyEntry.sessionToken);
      syncSelectedBoardId(roomState);
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
    if (isCurrentPlayer && TURN_TIMER_PHASES.has(gameState.turnPhase)) {
      pauseGameForDisconnect(playerRecord);
    }

    emitGameStateSync();
  });
});

function startServer(port = process.env.PORT || 3000, { logStartup = true } = {}) {
  const parsedPort = Number.parseInt(port, 10);
  const listenPort = Number.isNaN(parsedPort) ? port : parsedPort;

  if (server.listening) {
    const address = server.address();
    activeListenPort = typeof address === 'object' && address ? address.port : listenPort;
    return Promise.resolve({ server, io, port: activeListenPort });
  }

  if (serverStartPromise) {
    return serverStartPromise;
  }

  serverStartPromise = new Promise((resolve, reject) => {
    const handleListening = () => {
      server.off('error', handleError);
      const address = server.address();
      activeListenPort = typeof address === 'object' && address ? address.port : listenPort;
      if (logStartup) {
        console.log(`\n  🎲 Monopoly server running at http://localhost:${activeListenPort}\n`);
      }
      serverStartPromise = null;
      resolve({ server, io, port: activeListenPort });
    };

    const handleError = (error) => {
      server.off('listening', handleListening);
      serverStartPromise = null;
      reject(error);
    };

    server.once('listening', handleListening);
    server.once('error', handleError);
    server.listen(listenPort);
  });

  return serverStartPromise;
}

function resetServerStateForTests() {
  rooms.forEach(roomState => {
    withRoomState(roomState, () => {
      clearRoomGameRuntime({ preserveLobby: false });
      roomState.endedAt = Date.now();
    });
  });

  rooms.clear();
  supersededSocketIds.clear();
  assignRoomState(null);
}

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resetServerStateForTests();
      activeListenPort = null;
      serverStartPromise = null;
      resolve();
      return;
    }

    io.disconnectSockets(true);
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resetServerStateForTests();
      activeListenPort = null;
      serverStartPromise = null;
      resolve();
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  server,
  io,
  startServer,
  stopServer,
  resetServerStateForTests
};
