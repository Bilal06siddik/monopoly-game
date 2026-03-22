// ═══════════════════════════════════════════════════════════
//  CARD HELPERS — Rich action card resolution
// ═══════════════════════════════════════════════════════════

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        const rules = require('./rules');
        module.exports = factory(rules);
    } else {
        root.MonopolyCardUtils = factory(root.MonopolyRules);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (rules) {
    function defaultDiceRoll() {
        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        return { die1, die2, total: die1 + die2 };
    }

    function resolveActionCard(gameState, player, card, options = {}) {
        const drawDice = options.drawDice || defaultDiceRoll;
        const result = {
            amountDelta: 0,
            amountLabel: '',
            detailText: '',
            moveResult: null,
            shouldEvaluateTile: false,
            evaluationContext: {},
            sentToJail: false
        };

        switch (card.type) {
            case 'collect':
                player.money += card.amount;
                result.amountDelta = card.amount;
                result.amountLabel = `+$${card.amount}`;
                break;

            case 'pay':
                player.money -= card.amount;
                result.amountDelta = -card.amount;
                result.amountLabel = `-$${card.amount}`;
                break;

            case 'collectFromEach': {
                let totalCollected = 0;
                gameState.players.forEach(otherPlayer => {
                    if (otherPlayer.id === player.id || !otherPlayer.isActive) return;
                    otherPlayer.money -= card.amount;
                    player.money += card.amount;
                    totalCollected += card.amount;
                });
                result.amountDelta = totalCollected;
                result.amountLabel = `+$${totalCollected}`;
                result.detailText = `Collected $${card.amount} from each active player.`;
                break;
            }

            case 'pardon':
                player.pardons += 1;
                result.amountLabel = '+1 Pardon';
                result.detailText = 'Added a Get Out of Jail Free card to your inventory.';
                break;

            case 'moveRelative':
                result.moveResult = gameState.movePlayer(player.id, card.steps);
                result.shouldEvaluateTile = true;
                result.detailText = `Moved to ${result.moveResult.landedTile.name}.`;
                break;

            case 'moveAbsolute':
                if (card.sendToJail) {
                    const oldPosition = player.position;
                    result.moveResult = gameState.movePlayerTo(player.id, 10, {
                        collectGoOnPass: false,
                        collectGoOnLand: false
                    });
                    player.position = 10;
                    player.inJail = true;
                    player.jailTurns = 0;
                    player.jailBuyoutAvailable = false;
                    player.jailedOnTurn = gameState.turnCount;
                    result.sentToJail = true;
                    result.shouldEvaluateTile = false;
                    result.detailText = `Moved from ${oldPosition} to Jail.`;
                } else {
                    result.moveResult = gameState.movePlayerTo(player.id, card.targetIndex, {
                        collectGoOnPass: card.collectGoOnPass !== false,
                        collectGoOnLand: card.collectGoOnLand !== false
                    });
                    result.shouldEvaluateTile = true;
                    result.detailText = `Moved to ${result.moveResult.landedTile.name}.`;
                }
                break;

            case 'moveNearest': {
                const targetIndex = rules.findNearestTileIndex(gameState.properties, player.position, card.targetType);
                if (targetIndex === null) break;

                result.moveResult = gameState.movePlayerTo(player.id, targetIndex, {
                    collectGoOnPass: true,
                    collectGoOnLand: targetIndex === 0
                });
                result.shouldEvaluateTile = true;
                result.detailText = `Moved to ${result.moveResult.landedTile.name}.`;

                if (card.targetType === 'railroad') {
                    result.evaluationContext.doubleRailroadRent = true;
                }
                if (card.targetType === 'utility') {
                    const dice = drawDice();
                    result.evaluationContext.utilityDiceTotal = dice.total;
                    result.detailText += ` Utility dice: ${dice.die1} + ${dice.die2} = ${dice.total}.`;
                }
                break;
            }
        }

        return result;
    }

    return {
        resolveActionCard
    };
});
