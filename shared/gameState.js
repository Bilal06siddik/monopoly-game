// ═══════════════════════════════════════════════════════════
//  GAME STATE — OOP classes for Player, Property, GameState
//  Shared between server and client
// ═══════════════════════════════════════════════════════════

class Player {
    constructor(id, character, color) {
        this.id = id;
        this.character = character;
        this.color = color;
        this.position = 0;        // tile index 0-39
        this.money = 1500;
        this.properties = [];     // array of tile indices owned
        this.inJail = false;
        this.jailTurns = 0;
        this.pardons = 0;         // get-out-of-jail-free cards
        this.isActive = true;     // still in the game
    }

    toJSON() {
        return {
            id: this.id,
            character: this.character,
            color: this.color,
            position: this.position,
            money: this.money,
            properties: this.properties,
            inJail: this.inJail,
            jailTurns: this.jailTurns,
            pardons: this.pardons,
            isActive: this.isActive
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
        this.colorGroup = tileData.colorGroup;
        this.owner = null;        // player id or null
        this.houses = 0;          // 0-4 houses, 5 = hotel
        this.isMortgaged = false;
        this.landedCount = 0;     // analytics
        this.rentCollected = 0;   // analytics
        this.history = [];        // [{type, character, color, amount, timestamp}]
    }

    get isPurchasable() {
        return (this.type === 'property' || this.type === 'railroad' || this.type === 'utility')
            && this.owner === null;
    }

    addHistory(type, character, color, amount) {
        this.history.push({ type, character, color, amount, timestamp: Date.now() });
        if (this.history.length > 20) this.history.shift(); // cap at 20 events
    }

    toJSON() {
        return {
            index: this.index,
            name: this.name,
            type: this.type,
            price: this.price,
            rent: this.rent,
            colorGroup: this.colorGroup,
            owner: this.owner,
            houses: this.houses,
            isMortgaged: this.isMortgaged,
            landedCount: this.landedCount,
            rentCollected: this.rentCollected,
            history: this.history
        };
    }
}

class GameState {
    constructor(boardData) {
        this.players = [];
        this.properties = boardData.map(td => new Property(td));
        this.currentPlayerIndex = 0;
        this.isGameStarted = false;
        this.doublesCount = 0;
        this.turnPhase = 'waiting'; // waiting | rolling | moving | buying | done
        this.taxPool = 0;
        this.turnTimer = null;
    }

    addPlayer(id, character, color) {
        const player = new Player(id, character, color);
        this.players.push(player);
        return player;
    }

    getPlayerById(id) {
        return this.players.find(p => p.id === id);
    }

    getPlayerByCharacter(character) {
        return this.players.find(p => p.character === character);
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
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
        const newPosition = (oldPosition + steps) % 40;
        const passedGo = (oldPosition + steps) >= 40;

        player.position = newPosition;

        // Collect $200 for passing GO
        if (passedGo && newPosition !== 0) {
            player.money += 200;
        }
        // Landing exactly on GO also gives $200
        if (newPosition === 0 && steps > 0) {
            player.money += 200;
        }

        return {
            playerId,
            oldPosition,
            newPosition,
            steps,
            passedGo: passedGo || newPosition === 0,
            landedTile: this.properties[newPosition]
        };
    }

    nextTurn() {
        // If doubles were rolled, same player goes again (unless 3 in a row)
        if (this.doublesCount > 0 && this.doublesCount < 3) {
            // Same player rolls again
            return this.getCurrentPlayer();
        }

        // Reset doubles count
        this.doublesCount = 0;

        // Advance to next active player
        let attempts = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
            attempts++;
        } while (!this.players[this.currentPlayerIndex].isActive && attempts < this.players.length);

        this.turnPhase = 'waiting';
        return this.getCurrentPlayer();
    }

    getState() {
        return {
            players: this.players.map(p => p.toJSON()),
            properties: this.properties.map(p => p.toJSON()),
            currentPlayerIndex: this.currentPlayerIndex,
            currentPlayerId: this.getCurrentPlayer()?.id,
            isGameStarted: this.isGameStarted,
            turnPhase: this.turnPhase,
            taxPool: this.taxPool,
            turnTimer: this.turnTimer
        };
    }
}

// Export for Node.js / expose for browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Player, Property, GameState };
} else {
    window.GameStateClasses = { Player, Property, GameState };
}
