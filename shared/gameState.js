// ═══════════════════════════════════════════════════════════
//  GAME STATE — Shared multiplayer state models
// ═══════════════════════════════════════════════════════════

function createDefaultPlayerStats() {
    return {
        cardsDrawn: 0,
        goPasses: 0,
        jailVisits: 0,
        rentPaid: 0,
        rentReceived: 0,
        propertiesBought: 0,
        housesBuilt: 0,
        housesSold: 0,
        auctionsWon: 0,
        tradesCompleted: 0
    };
}

class Player {
    constructor(id, character, color, sessionToken = null, options = {}) {
        this.id = id;
        this.character = character;
        this.name = options.name || character;
        this.color = color;
        this.tokenId = options.tokenId || 'pawn';
        this.sessionToken = sessionToken;
        this.customAvatarUrl = options.customAvatarUrl || null;
        this.socketId = null;
        this.position = 0;        // tile index 0-39
        this.money = 1500;
        this.properties = [];     // array of tile indices owned
        this.inJail = false;
        this.jailTurns = 0;
        this.pardons = 0;
        this.isActive = true;
        this.isBot = Boolean(options.isBot);
        this.isConnected = options.isConnected !== false;
        this.connectedAt = Date.now();
        this.lastSeenAt = Date.now();
        this.bankruptcyDeadline = null;
        this.stats = createDefaultPlayerStats();
    }

    toJSON() {
        return {
            id: this.id,
            character: this.character,
            name: this.name,
            color: this.color,
            tokenId: this.tokenId,
            position: this.position,
            money: this.money,
            properties: [...this.properties],
            inJail: this.inJail,
            jailTurns: this.jailTurns,
            pardons: this.pardons,
            isActive: this.isActive,
            isConnected: this.isConnected,
            isBot: this.isBot,
            bankruptcyDeadline: this.bankruptcyDeadline,
            customAvatarUrl: this.customAvatarUrl,
            stats: { ...this.stats }
        };
    }
}

class Property {
    constructor(tileData) {
        this.index = tileData.index;
        this.name = tileData.name;
        this.type = tileData.type;
        this.price = tileData.price;
        this.rent = tileData.rent;
        this.rentTiers = Array.isArray(tileData.rentTiers) ? [...tileData.rentTiers] : null;
        this.colorGroup = tileData.colorGroup;
        this.owner = null;
        this.houses = 0;          // 0-4 houses, 5 = hotel
        this.isMortgaged = false;
        this.landedCount = 0;
        this.rentCollected = 0;
        this.history = [];
    }

    get isPurchasable() {
        return (this.type === 'property' || this.type === 'railroad' || this.type === 'utility')
            && this.owner === null;
    }

    addHistory(type, character, color, amount) {
        this.history.push({ type, character, color, amount, timestamp: Date.now() });
        if (this.history.length > 20) this.history.shift();
    }

    toJSON() {
        return {
            index: this.index,
            name: this.name,
            type: this.type,
            price: this.price,
            rent: this.rent,
            rentTiers: this.rentTiers ? [...this.rentTiers] : null,
            colorGroup: this.colorGroup,
            owner: this.owner,
            houses: this.houses,
            isMortgaged: this.isMortgaged,
            landedCount: this.landedCount,
            rentCollected: this.rentCollected,
            history: [...this.history]
        };
    }
}

class GameState {
    constructor(boardData) {
        this.players = [];
        this.properties = boardData.map(tileData => new Property(tileData));
        this.currentPlayerIndex = 0;
        this.isGameStarted = false;
        this.doublesCount = 0;
        this.turnPhase = 'waiting'; // waiting | rolling | moving | buying | auctioning | done
        this.taxPool = 0;
        this.turnTimer = null;
        this.matchStartedAt = null;
        this.matchEndedAt = null;
        this.turnCount = 0;
        this.pauseState = null;
        this.eliminationOrder = [];
    }

    addPlayer(id, character, color, sessionToken = null, options = {}) {
        const player = new Player(id, character, color, sessionToken, options);
        this.players.push(player);
        return player;
    }

    getPlayerById(id) {
        return this.players.find(player => player.id === id);
    }

    getPlayerBySocketId(socketId) {
        return this.players.find(player => player.socketId === socketId);
    }

    getPlayerBySessionToken(sessionToken) {
        return this.players.find(player => player.sessionToken === sessionToken);
    }

    getPlayerByCharacter(character) {
        return this.players.find(player => player.character === character);
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    getActivePlayers() {
        return this.players.filter(player => player.isActive);
    }

    rollDice() {
        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        const isDoubles = die1 === die2;
        const total = die1 + die2;

        if (isDoubles) {
            this.doublesCount++;
        } else {
            this.doublesCount = 0;
        }

        return { die1, die2, total, isDoubles };
    }

    movePlayer(playerId, steps) {
        const player = this.getPlayerById(playerId);
        if (!player) return null;

        const oldPosition = player.position;
        const boardSize = this.properties.length;
        const rawPosition = oldPosition + steps;
        let newPosition = rawPosition % boardSize;
        if (newPosition < 0) newPosition += boardSize;
        const passedGo = steps > 0 && rawPosition >= boardSize;

        player.position = newPosition;

        if (passedGo && newPosition !== 0) {
            player.money += 200;
        }
        if (newPosition === 0 && steps > 0) {
            player.money += 200;
        }

        return {
            playerId,
            oldPosition,
            newPosition,
            steps: Math.abs(steps),
            rawSteps: steps,
            passedGo: passedGo || (newPosition === 0 && steps > 0),
            landedTile: this.properties[newPosition]
        };
    }

    movePlayerTo(playerId, targetPosition, options = {}) {
        const player = this.getPlayerById(playerId);
        if (!player) return null;

        const collectGoOnPass = options.collectGoOnPass !== false;
        const collectGoOnLand = options.collectGoOnLand !== false;
        const boardSize = this.properties.length;
        const normalizedTarget = ((targetPosition % boardSize) + boardSize) % boardSize;
        const oldPosition = player.position;
        const stepsForward = (normalizedTarget - oldPosition + boardSize) % boardSize;
        const passedGo = normalizedTarget < oldPosition || (stepsForward === 0 && options.forceLoop === true);

        player.position = normalizedTarget;

        if (collectGoOnPass && passedGo && normalizedTarget !== 0) {
            player.money += 200;
        }
        if (collectGoOnLand && normalizedTarget === 0 && oldPosition !== 0) {
            player.money += 200;
        }

        return {
            playerId,
            oldPosition,
            newPosition: normalizedTarget,
            steps: stepsForward,
            rawSteps: stepsForward,
            passedGo: Boolean((collectGoOnPass && passedGo) || (collectGoOnLand && normalizedTarget === 0 && oldPosition !== 0)),
            landedTile: this.properties[normalizedTarget]
        };
    }

    nextTurn() {
        const currentPlayer = this.getCurrentPlayer();
        if (this.hasPendingExtraRoll() && currentPlayer?.isActive) {
            return currentPlayer;
        }

        this.doublesCount = 0;

        let attempts = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            attempts++;
        } while (!this.players[this.currentPlayerIndex].isActive && attempts < this.players.length);

        this.turnPhase = 'waiting';
        return this.getCurrentPlayer();
    }

    hasPendingExtraRoll() {
        return this.doublesCount > 0 && this.doublesCount < 3;
    }

    getState() {
        return {
            players: this.players.map(player => player.toJSON()),
            properties: this.properties.map(property => property.toJSON()),
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayerId: this.getCurrentPlayer()?.id || null,
            isGameStarted: this.isGameStarted,
            hasPendingExtraRoll: this.hasPendingExtraRoll(),
            turnPhase: this.turnPhase,
            taxPool: this.taxPool,
            turnTimer: this.turnTimer,
            matchStartedAt: this.matchStartedAt,
            matchEndedAt: this.matchEndedAt,
            turnCount: this.turnCount,
            pauseState: this.pauseState,
            eliminationOrder: [...this.eliminationOrder]
        };
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Player, Property, GameState, createDefaultPlayerStats };
} else {
    window.GameStateClasses = { Player, Property, GameState, createDefaultPlayerStats };
}
