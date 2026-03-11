const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const BOARD_DATA = require('./shared/boardData');
const ACTION_CARDS = require('./shared/actionCards');
const { GameState } = require('./shared/gameState');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// ── Lobby State ─────────────────────────────────────────────
const CHARACTERS = ['Bilo', 'Os', 'Ziko', 'Maro'];
const CHARACTER_COLORS = {
  'Bilo': '#6c5ce7', 'Os': '#e17055', 'Ziko': '#00b894', 'Maro': '#fdcb6e'
};
const lobbyPlayers = {};
const takenCharacters = new Set();

// ── Game State ──────────────────────────────────────────────
let gameState = null;
let lastDiceTotal = 0;
let lastDiceIsDoubles = false;

// Action cards deck
let actionDeck = [];
function shuffleActionDeck() {
  actionDeck = [...ACTION_CARDS].sort(() => Math.random() - 0.5);
}
function drawActionCard() {
  if (actionDeck.length === 0) shuffleActionDeck();
  return actionDeck.pop();
}

// ── Auction State ───────────────────────────────────────────
let auctionState = null;
let auctionTimer = null;

// ── History Log ─────────────────────────────────────────────
function logEvent(text, type = 'info') {
  io.emit('history-event', { text, type, time: Date.now() });
}

function getLobbyState() {
  const playerList = Object.entries(lobbyPlayers).map(([id, data]) => ({
    id, name: data.name, character: data.character
  }));
  return {
    players: playerList,
    characters: CHARACTERS.map(c => ({
      name: c,
      taken: takenCharacters.has(c),
      takenBy: playerList.find(p => p.character === c)?.id || null
    }))
  };
}

// ── Rent Calculation ────────────────────────────────────────
function calculateRent(property, diceTotal) {
  if (!property || !property.owner || property.isMortgaged) return 0;
  if (property.type === 'railroad') {
    const rrCount = gameState.properties.filter(p => p.type === 'railroad' && p.owner === property.owner).length;
    return 25 * Math.pow(2, rrCount - 1);
  }
  if (property.type === 'utility') {
    const utilCount = gameState.properties.filter(p => p.type === 'utility' && p.owner === property.owner).length;
    return utilCount === 1 ? diceTotal * 4 : diceTotal * 10;
  }
  if (property.type === 'property') {
    const houseMultipliers = [1, 5, 15, 45, 80, 125];
    return property.rent * (houseMultipliers[property.houses] || 1);
  }
  return property.rent;
}

// ── Bankruptcy Handler ──────────────────────────────────────
function handleBankruptcy(player) {
  player.isActive = false;
  player.money = 0;
  const returnedProps = [];
  gameState.properties.forEach(p => {
    if (p.owner === player.id) {
      p.owner = null;
      p.houses = 0;
      returnedProps.push(p.index);
    }
  });
  player.properties = [];
  console.log(`💀 ${player.character} went BANKRUPT!`);
  logEvent(`💀 ${player.character} went BANKRUPT!`, 'bankrupt');
  io.emit('player-bankrupt', {
    playerId: player.id,
    character: player.character,
    returnedProperties: returnedProps,
    gameState: gameState.getState()
  });
  const activePlayers = gameState.players.filter(p => p.isActive);
  if (activePlayers.length === 1) {
    logEvent(`🏆 ${activePlayers[0].character} WINS THE GAME!`, 'win');
    io.emit('game-over', { winner: activePlayers[0].toJSON(), gameState: gameState.getState() });
  }
}

// ── Evaluate Tile After Landing ─────────────────────────────
function evaluateTile(socket, player, diceTotal) {
  const tile = gameState.properties[player.position];

  // 0: GO — already handled by movePlayer

  // 10: Just Visiting / Bailout — collect taxPool if not in jail
  if (player.position === 10 && !player.inJail) {
    const collected = gameState.taxPool;
    if (collected > 0) {
      gameState.taxPool = 0;
      player.money += collected;
      logEvent(`💰 ${player.character} collected the $${collected} Bailout fund!`, 'buy');
      io.emit('bailout-collected', {
        playerId: player.id, character: player.character,
        amount: collected, gameState: gameState.getState()
      });
    }
    return 'done';
  }

  // 30: Go To Jail
  if (player.position === 30) {
    player.position = 10;
    player.inJail = true;
    player.jailTurns = 0;
    logEvent(`🚔 ${player.character} was sent to Jail!`, 'tax');
    io.emit('sent-to-jail', {
      playerId: player.id, character: player.character,
      gameState: gameState.getState()
    });
    return 'done';
  }

  if (tile.type === 'tax') {
    const taxAmount = tile.rent;
    player.money -= taxAmount;
    gameState.taxPool += taxAmount;  // feed taxPool
    logEvent(`💸 ${player.character} paid $${taxAmount} in ${tile.name}`, 'tax');
    io.emit('tax-paid', {
      playerId: player.id, character: player.character,
      amount: taxAmount, tileName: tile.name,
      gameState: gameState.getState()
    });
    if (player.money < 0) { handleBankruptcy(player); return 'bankrupt'; }
    return 'done';
  }

  if (tile.type === 'chance' || tile.type === 'chest') {
    const card = drawActionCard();
    if (card.type === 'collect') {
      player.money += card.amount;
      logEvent(`🃏 ${player.character}: "${card.text}"`, 'card');
    } else {
      player.money -= card.amount;
      logEvent(`🃏 ${player.character}: "${card.text}"`, 'card');
    }
    io.emit('card-drawn', {
      playerId: player.id, character: player.character,
      card, gameState: gameState.getState()
    });
    if (player.money < 0) { handleBankruptcy(player); return 'bankrupt'; }
    return 'done';
  }

  if (tile.type === 'property' || tile.type === 'railroad' || tile.type === 'utility') {
    tile.landedCount++;
    if (tile.owner === null) {
      gameState.turnPhase = 'buying';
      socket.emit('buy-prompt', {
        playerId: player.id, tileIndex: tile.index,
        tileName: tile.name, tileType: tile.type,
        price: tile.price, colorGroup: tile.colorGroup,
        canAfford: player.money >= tile.price,
        gameState: gameState.getState()
      });
      socket.broadcast.emit('player-deciding', { character: player.character, tileName: tile.name });
      return 'buying';
    } else if (tile.owner !== player.id) {
      const rent = calculateRent(tile, diceTotal);
      const owner = gameState.getPlayerById(tile.owner);
      player.money -= rent;
      owner.money += rent;
      tile.rentCollected += rent;
      tile.addHistory('rent', player.character, player.color, rent);
      logEvent(`💰 ${player.character} paid $${rent} rent to ${owner.character} for ${tile.name}`, 'rent');
      io.emit('rent-paid', {
        payerId: player.id, payerCharacter: player.character,
        ownerId: owner.id, ownerCharacter: owner.character,
        amount: rent, tileName: tile.name,
        gameState: gameState.getState()
      });
      if (player.money < 0) { handleBankruptcy(player); return 'bankrupt'; }
      return 'done';
    }
    return 'done';
  }
  return 'done';
}

// ── Auction Logic ───────────────────────────────────────────
function startAuction(tileIndex, startingBid, initiatorId) {
  if (auctionState) return; // Already in auction
  const tile = gameState.properties[tileIndex];
  if (!tile) return;

  auctionState = {
    tileIndex,
    tileName: tile.name,
    tileType: tile.type,
    tilePrice: tile.price,
    tileRent: tile.rent,
    tileColorGroup: tile.colorGroup,
    currentBid: startingBid || 0,
    currentBidderId: null,
    currentBidderCharacter: null,
    timeRemaining: 15,
    initiatorId
  };

  logEvent(`🔨 Auction started for ${tile.name}!`, 'auction');
  io.emit('auction-started', {
    auction: auctionState,
    players: gameState.players.map(p => p.toJSON()),
    gameState: gameState.getState()
  });

  // Start 15-second countdown
  auctionTimer = setInterval(() => {
    auctionState.timeRemaining--;
    io.emit('auction-tick', { timeRemaining: auctionState.timeRemaining });

    if (auctionState.timeRemaining <= 0) {
      endAuction();
    }
  }, 1000);
}

function endAuction() {
  if (!auctionState) return;
  clearInterval(auctionTimer);
  auctionTimer = null;

  const tile = gameState.properties[auctionState.tileIndex];
  let winner = null;

  if (auctionState.currentBidderId) {
    winner = gameState.getPlayerById(auctionState.currentBidderId);
    if (winner) {
      winner.money -= auctionState.currentBid;
      tile.owner = winner.id;
      winner.properties.push(tile.index);
      logEvent(`🔨 ${winner.character} won ${tile.name} for $${auctionState.currentBid}!`, 'auction');
    }
  } else {
    logEvent(`🔨 No bids on ${tile.name}. Property remains unowned.`, 'auction');
  }

  io.emit('auction-ended', {
    winnerId: winner?.id || null,
    winnerCharacter: winner?.character || null,
    bid: auctionState.currentBid,
    tileName: auctionState.tileName,
    tileIndex: auctionState.tileIndex,
    gameState: gameState.getState()
  });

  auctionState = null;

  // Advance turn if this auction was triggered by a pass
  if (gameState.turnPhase === 'buying' || gameState.turnPhase === 'auctioning') {
    advanceTurnGlobal();
  }
}

function advanceTurnGlobal() {
  gameState.turnPhase = 'done';
  const nextPlayer = gameState.nextTurn();
  console.log(`✦ Turn passes to ${nextPlayer.character}`);
  gameState.turnPhase = 'waiting';
  io.emit('turn-changed', {
    currentPlayerId: nextPlayer.id,
    currentCharacter: nextPlayer.character,
    gameState: gameState.getState()
  });
}

// ── Socket.io Events ────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`✦ Player connected: ${socket.id}`);
  lobbyPlayers[socket.id] = { name: null, character: null };
  socket.emit('lobby-update', getLobbyState());

  if (gameState && gameState.isGameStarted) {
    socket.emit('game-state-sync', gameState.getState());
  }

  // ── Character Selection ─────────────────────────────────
  socket.on('select-character', (characterName) => {
    if (gameState && gameState.isGameStarted) {
      socket.emit('character-error', { message: 'Game already in progress' });
      return;
    }
    if (!CHARACTERS.includes(characterName)) {
      socket.emit('character-error', { message: 'Invalid character' });
      return;
    }
    if (takenCharacters.has(characterName)) {
      socket.emit('character-taken', { character: characterName, message: 'Character already taken' });
      return;
    }
    const prev = lobbyPlayers[socket.id]?.character;
    if (prev) takenCharacters.delete(prev);
    takenCharacters.add(characterName);
    lobbyPlayers[socket.id].character = characterName;
    lobbyPlayers[socket.id].name = characterName;
    socket.emit('character-confirmed', { character: characterName });
    io.emit('lobby-update', getLobbyState());
  });

  socket.on('deselect-character', () => {
    const char = lobbyPlayers[socket.id]?.character;
    if (char) {
      takenCharacters.delete(char);
      lobbyPlayers[socket.id].character = null;
      lobbyPlayers[socket.id].name = null;
      io.emit('lobby-update', getLobbyState());
    }
  });

  // ── Start Game ──────────────────────────────────────────
  socket.on('requestStartGame', () => {
    const readyPlayers = Object.entries(lobbyPlayers).filter(([, data]) => data.character !== null);
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
    readyPlayers.forEach(([id, data]) => {
      const p = gameState.addPlayer(id, data.character, CHARACTER_COLORS[data.character]);
      // EXPLICIT EMERGENCY RESETS
      p.money = 1500;
      p.position = 0;
      p.inJail = false;
      p.isActive = true;
      p.jailTurns = 0;
      p.properties = [];
    });
    gameState.isGameStarted = true;
    gameState.turnPhase = 'waiting';
    console.log(`\n  🎮 Game started with ${readyPlayers.length} players!\n`);
    logEvent(`🎮 Game started with ${readyPlayers.length} players!`, 'system');
    io.emit('gameStarted', gameState.getState());
  });

  // ── Roll Dice ───────────────────────────────────────────
  socket.on('roll-dice', () => {
    if (!gameState || !gameState.isGameStarted) return;
    if (auctionState) { socket.emit('game-error', { message: 'Auction in progress' }); return; }
    const currentPlayer = gameState.getCurrentPlayer();
    if (currentPlayer.id !== socket.id) return;
    if (gameState.turnPhase !== 'waiting') return;

    gameState.turnPhase = 'rolling';
    const diceResult = gameState.rollDice();
    lastDiceTotal = diceResult.total;
    lastDiceIsDoubles = diceResult.isDoubles;

    // ── Jail handling ───────────
    if (currentPlayer.inJail) {
      if (diceResult.isDoubles) {
        // Freed by doubles!
        currentPlayer.inJail = false;
        currentPlayer.jailTurns = 0;
        logEvent(`🔓 ${currentPlayer.character} rolled doubles and escaped jail!`, 'roll');
      } else {
        currentPlayer.jailTurns++;
        if (currentPlayer.jailTurns >= 3) {
          // Force pay $50 after 3 failed attempts
          currentPlayer.money -= 50;
          currentPlayer.inJail = false;
          currentPlayer.jailTurns = 0;
          logEvent(`🔓 ${currentPlayer.character} paid $50 to leave jail (3 turns).`, 'tax');
        } else {
          logEvent(`🔒 ${currentPlayer.character} failed to roll doubles (jail turn ${currentPlayer.jailTurns}/3)`, 'roll');
          // Only show dice, don't move
          io.emit('dice-rolled', {
            playerId: socket.id, character: currentPlayer.character,
            die1: diceResult.die1, die2: diceResult.die2,
            total: diceResult.total, isDoubles: false,
            moveResult: { oldPosition: currentPlayer.position, newPosition: currentPlayer.position, steps: 0, passedGo: false },
            gameState: gameState.getState(),
            jailRoll: true
          });
          return;
        }
      }
    }

    const moveResult = gameState.movePlayer(socket.id, diceResult.total);
    gameState.turnPhase = 'moving';

    logEvent(`🎲 ${currentPlayer.character} rolled ${diceResult.die1} & ${diceResult.die2}${diceResult.isDoubles ? ' (DOUBLES!)' : ''}`, 'roll');

    io.emit('dice-rolled', {
      playerId: socket.id,
      character: currentPlayer.character,
      die1: diceResult.die1, die2: diceResult.die2,
      total: diceResult.total, isDoubles: diceResult.isDoubles,
      moveResult: {
        oldPosition: moveResult.oldPosition,
        newPosition: moveResult.newPosition,
        steps: moveResult.steps,
        passedGo: moveResult.passedGo
      },
      gameState: gameState.getState()
    });
  });

  // ── Move Complete → Evaluate Tile ───────────────────────
  socket.on('move-complete', () => {
    if (!gameState || !gameState.isGameStarted) return;
    const currentPlayer = gameState.getCurrentPlayer();
    if (currentPlayer.id !== socket.id) return;

    const result = evaluateTile(socket, currentPlayer, lastDiceTotal);
    if (result === 'buying') return;
    if (result === 'bankrupt') {
      const activePlayers = gameState.players.filter(p => p.isActive);
      if (activePlayers.length > 1) advanceTurnGlobal();
      return;
    }
    advanceTurnGlobal();
  });

  // ── Buy Property ────────────────────────────────────────
  socket.on('buy-property', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    const currentPlayer = gameState.getCurrentPlayer();
    if (currentPlayer.id !== socket.id) return;
    if (gameState.turnPhase !== 'buying') return;

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== null) return;
    if (currentPlayer.money < tile.price) return;

    currentPlayer.money -= tile.price;
    tile.owner = currentPlayer.id;
    currentPlayer.properties.push(tile.index);
    tile.addHistory('buy', currentPlayer.character, currentPlayer.color, tile.price);
    logEvent(`🏠 ${currentPlayer.character} bought ${tile.name} for $${tile.price}`, 'buy');

    io.emit('property-bought', {
      playerId: currentPlayer.id, character: currentPlayer.character,
      tileIndex: tile.index, tileName: tile.name,
      price: tile.price, gameState: gameState.getState()
    });
    advanceTurnGlobal();
  });

  // ── Buy Out of Jail ─────────────────────────────────────
  socket.on('buy-out-jail', () => {
    if (!gameState || !gameState.isGameStarted) return;
    const player = gameState.getPlayerById(socket.id);
    if (!player || !player.inJail) return;
    if (player.money < 50) {
      socket.emit('game-error', { message: 'Not enough money to buy out of jail ($50)' });
      return;
    }
    player.money -= 50;
    gameState.taxPool += 50;  // jail fine goes into taxPool
    player.inJail = false;
    player.jailTurns = 0;
    logEvent(`🔓 ${player.character} paid $50 to leave jail!`, 'tax');
    io.emit('jail-state-changed', {
      playerId: player.id, character: player.character,
      inJail: false, gameState: gameState.getState()
    });
  });

  // ── Use Pardon Card ─────────────────────────────────────
  socket.on('use-pardon', () => {
    if (!gameState || !gameState.isGameStarted) return;
    const player = gameState.getPlayerById(socket.id);
    if (!player || !player.inJail || player.pardons <= 0) return;
    player.pardons--;
    player.inJail = false;
    player.jailTurns = 0;
    logEvent(`🃏 ${player.character} used a Pardon Card to leave jail!`, 'card');
    io.emit('jail-state-changed', {
      playerId: player.id, character: player.character,
      inJail: false, gameState: gameState.getState()
    });
  });

  // ── Pass Property → Start Auction ───────────────────────
  socket.on('pass-property', () => {
    if (!gameState || !gameState.isGameStarted) return;
    const currentPlayer = gameState.getCurrentPlayer();
    if (currentPlayer.id !== socket.id) return;
    if (gameState.turnPhase !== 'buying') return;

    const tile = gameState.properties[currentPlayer.position];
    logEvent(`⏭️ ${currentPlayer.character} passed on ${tile.name}`, 'pass');
    gameState.turnPhase = 'auctioning';
    startAuction(currentPlayer.position, 1, currentPlayer.id);
  });

  // ── Own Auction (sell own property) ─────────────────────
  socket.on('own-auction', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    if (auctionState) return;
    if (gameState.turnPhase !== 'waiting') return;

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== socket.id) return;

    // Remove property from owner
    const player = gameState.getPlayerById(socket.id);
    tile.owner = null;
    player.properties = player.properties.filter(i => i !== data.tileIndex);

    logEvent(`🔨 ${player.character} put ${tile.name} up for auction!`, 'auction');
    gameState.turnPhase = 'auctioning';
    startAuction(data.tileIndex, Math.floor(tile.price / 2), socket.id);
  });

  // ── Place Bid ───────────────────────────────────────────
  socket.on('place-bid', (data) => {
    if (!auctionState) return;
    const player = gameState.getPlayerById(socket.id);
    if (!player || !player.isActive) return;
    if (data.amount <= auctionState.currentBid) return;

    auctionState.currentBid = data.amount;
    auctionState.currentBidderId = socket.id;
    auctionState.currentBidderCharacter = player.character;
    // Reset timer to at least 5 seconds on new bid
    if (auctionState.timeRemaining < 5) auctionState.timeRemaining = 5;

    logEvent(`🔨 ${player.character} bid $${data.amount} on ${auctionState.tileName}`, 'bid');
    io.emit('auction-bid', {
      bidderId: socket.id,
      bidderCharacter: player.character,
      amount: data.amount,
      timeRemaining: auctionState.timeRemaining,
      auction: auctionState,
      gameState: gameState.getState()
    });
  });

  // ── Trade Offer ─────────────────────────────────────────
  socket.on('trade-offer', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    const from = gameState.getPlayerById(socket.id);
    const to = gameState.getPlayerById(data.targetId);
    if (!from || !to || !from.isActive || !to.isActive) return;

    const offer = {
      fromId: socket.id,
      fromCharacter: from.character,
      toId: data.targetId,
      toCharacter: to.character,
      offerProperties: data.offerProperties || [],
      offerCash: data.offerCash || 0,
      requestProperties: data.requestProperties || [],
      requestCash: data.requestCash || 0
    };

    logEvent(`🤝 ${from.character} offered a trade to ${to.character}`, 'trade');
    io.to(data.targetId).emit('trade-incoming', offer);
    socket.emit('trade-sent', offer);
  });

  // ── Trade Accept ────────────────────────────────────────
  socket.on('trade-accept', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    const accepter = gameState.getPlayerById(socket.id);
    const offerer = gameState.getPlayerById(data.fromId);
    if (!accepter || !offerer) return;

    // Swap cash
    offerer.money -= data.offerCash;
    offerer.money += data.requestCash;
    accepter.money += data.offerCash;
    accepter.money -= data.requestCash;

    // Swap properties
    (data.offerProperties || []).forEach(idx => {
      const prop = gameState.properties[idx];
      if (prop && prop.owner === data.fromId) {
        prop.owner = socket.id;
        offerer.properties = offerer.properties.filter(i => i !== idx);
        accepter.properties.push(idx);
      }
    });
    (data.requestProperties || []).forEach(idx => {
      const prop = gameState.properties[idx];
      if (prop && prop.owner === socket.id) {
        prop.owner = data.fromId;
        accepter.properties = accepter.properties.filter(i => i !== idx);
        offerer.properties.push(idx);
      }
    });

    logEvent(`✅ ${accepter.character} accepted trade with ${offerer.character}!`, 'trade');
    io.emit('trade-completed', {
      fromId: data.fromId, toId: socket.id,
      fromCharacter: offerer.character, toCharacter: accepter.character,
      gameState: gameState.getState()
    });
  });

  // ── Trade Reject ────────────────────────────────────────
  socket.on('trade-reject', (data) => {
    const rejecter = gameState?.getPlayerById(socket.id);
    const offerer = gameState?.getPlayerById(data.fromId);
    if (rejecter && offerer) {
      logEvent(`❌ ${rejecter.character} rejected trade from ${offerer.character}`, 'trade');
    }
    io.to(data.fromId).emit('trade-rejected', {
      fromId: data.fromId, toId: socket.id
    });
  });

  // ── Upgrade Property (add house) ────────────────────────
  socket.on('upgrade-property', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    const player = gameState.getPlayerById(socket.id);
    if (!player) return;

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== socket.id) return;
    if (tile.type !== 'property') return;
    if (tile.isMortgaged) return;
    if (tile.houses >= 5) return;

    const upgradeCost = Math.floor(tile.price * 0.5);
    if (player.money < upgradeCost) {
      socket.emit('game-error', { message: `Need $${upgradeCost} to upgrade` });
      return;
    }

    player.money -= upgradeCost;
    tile.houses++;
    const label = tile.houses >= 5 ? 'Hotel' : `House ${tile.houses}`;
    logEvent(`🏗️ ${player.character} built ${label} on ${tile.name} ($${upgradeCost})`, 'buy');

    io.emit('property-upgraded', {
      playerId: socket.id, character: player.character,
      tileIndex: tile.index, tileName: tile.name,
      houses: tile.houses, cost: upgradeCost,
      gameState: gameState.getState()
    });
  });

  // ── Downgrade Property (remove house) ───────────────────
  socket.on('downgrade-property', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    const player = gameState.getPlayerById(socket.id);
    if (!player) return;

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== socket.id) return;
    if (tile.houses <= 0) return;

    const refund = Math.floor(tile.price * 0.25);
    player.money += refund;
    tile.houses--;
    logEvent(`🔻 ${player.character} sold a house on ${tile.name} (+$${refund})`, 'sell');

    io.emit('property-downgraded', {
      playerId: socket.id, character: player.character,
      tileIndex: tile.index, tileName: tile.name,
      houses: tile.houses, refund,
      gameState: gameState.getState()
    });
  });

  // ── Mortgage Property ───────────────────────────────────
  socket.on('mortgage-property', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    const player = gameState.getPlayerById(socket.id);
    if (!player) return;

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== socket.id) return;
    if (tile.isMortgaged) return;
    if (tile.houses > 0) {
      socket.emit('game-error', { message: 'Sell all houses before mortgaging' });
      return;
    }

    tile.isMortgaged = true;
    const mortgageValue = Math.floor(tile.price / 2);
    player.money += mortgageValue;
    logEvent(`🏦 ${player.character} mortgaged ${tile.name} (+$${mortgageValue})`, 'sell');

    io.emit('property-mortgaged', {
      playerId: socket.id, character: player.character,
      tileIndex: tile.index, tileName: tile.name,
      mortgageValue, gameState: gameState.getState()
    });
  });

  // ── Unmortgage Property ─────────────────────────────────
  socket.on('unmortgage-property', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    const player = gameState.getPlayerById(socket.id);
    if (!player) return;

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== socket.id) return;
    if (!tile.isMortgaged) return;

    const unmortgageCost = Math.floor(tile.price * 0.55); // half + 10%
    if (player.money < unmortgageCost) {
      socket.emit('game-error', { message: `Need $${unmortgageCost} to unmortgage` });
      return;
    }

    player.money -= unmortgageCost;
    tile.isMortgaged = false;
    logEvent(`🏦 ${player.character} unmortgaged ${tile.name} (-$${unmortgageCost})`, 'buy');

    io.emit('property-unmortgaged', {
      playerId: socket.id, character: player.character,
      tileIndex: tile.index, tileName: tile.name,
      cost: unmortgageCost, gameState: gameState.getState()
    });
  });

  // ── Sell Property (back to bank) ────────────────────────
  socket.on('sell-property', (data) => {
    if (!gameState || !gameState.isGameStarted) return;
    const player = gameState.getPlayerById(socket.id);
    if (!player) return;

    const tile = gameState.properties[data.tileIndex];
    if (!tile || tile.owner !== socket.id) return;

    const sellValue = Math.floor(tile.price * 0.5) + (tile.houses * Math.floor(tile.price * 0.25));
    player.money += sellValue;
    tile.owner = null;
    tile.houses = 0;
    tile.isMortgaged = false;
    player.properties = player.properties.filter(i => i !== data.tileIndex);
    logEvent(`💰 ${player.character} sold ${tile.name} to the bank (+$${sellValue})`, 'sell');

    io.emit('property-sold', {
      playerId: socket.id, character: player.character,
      tileIndex: tile.index, tileName: tile.name,
      sellValue, gameState: gameState.getState()
    });
  });

  // ── Disconnect ──────────────────────────────────────────
  socket.on('disconnect', () => {
    const char = lobbyPlayers[socket.id]?.character;
    if (char) takenCharacters.delete(char);
    delete lobbyPlayers[socket.id];

    if (gameState && gameState.isGameStarted) {
      const gp = gameState.getPlayerById(socket.id);
      if (gp && gp.isActive) {
        gp.isActive = false;
        logEvent(`🚪 ${gp.character} disconnected`, 'system');
        const currentPlayer = gameState.getCurrentPlayer();
        if (currentPlayer && currentPlayer.id === socket.id) {
          advanceTurnGlobal();
        }
        const activePlayers = gameState.players.filter(p => p.isActive);
        if (activePlayers.length === 1) {
          logEvent(`🏆 ${activePlayers[0].character} WINS THE GAME!`, 'win');
          io.emit('game-over', { winner: activePlayers[0].toJSON(), gameState: gameState.getState() });
        }
      }
    }
    io.emit('lobby-update', getLobbyState());
    if (gameState && gameState.isGameStarted) {
      io.emit('game-state-sync', gameState.getState());
    }
  });
});

// ── Start Server ────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n  🎲 Monopoly server running at http://localhost:${PORT}\n`);
});
