const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
    startServer,
    stopServer,
    resetServerStateForTests
} = require('../../server');
const {
    randomRoomCode,
    waitForSocketEvent,
    waitForSocketEventMatching,
    connectClient,
    selectCharacter,
    setReadyState,
    disconnectClients
} = require('../helpers/socketHarness');

let port = null;
const trackedClients = [];

function track(client) {
    trackedClients.push(client);
    return client;
}

async function emitDevCommandAndWait(socket, payload, timeoutMs = 8000) {
    const syncPromise = waitForSocketEvent(socket, 'game-state-sync', timeoutMs);
    const errorPromise = waitForSocketEvent(socket, 'game-error', timeoutMs);
    socket.emit('dev-command', payload);

    const result = await Promise.race([
        syncPromise.then((state) => ({ ok: true, state })),
        errorPromise.then((error) => ({ ok: false, error }))
    ]);

    if (!result.ok) {
        throw new Error(result.error?.message || 'Developer command failed');
    }

    return result.state;
}

async function bootstrapBotMatch(botCount = 3) {
    const roomCode = randomRoomCode('SIM');
    const host = track(await connectClient({ port, roomCode }));

    await selectCharacter(host.socket, 'bilo');

    for (let count = 1; count <= botCount; count++) {
        const lobbyUpdatePromise = waitForSocketEventMatching(
            host.socket,
            'lobby-update',
            (payload) => Array.isArray(payload?.players) && payload.players.filter((player) => player.isBot).length === count,
            8000
        );
        host.socket.emit('add-random-bot');
        await lobbyUpdatePromise;
    }

    await setReadyState(host.socket, true);

    const startedPromise = waitForSocketEvent(host.socket, 'gameStarted', 10000);
    host.socket.emit('requestStartGame');
    const startedState = await startedPromise;

    const hostPlayer = startedState.players.find((player) => player.character === 'bilo');
    assert.ok(hostPlayer, 'host player should exist in started state');

    return { host, startedState, hostPlayerId: hostPlayer.id };
}

before(async () => {
    const runtime = await startServer(0, { logStartup: false });
    port = runtime.port;
});

afterEach(() => {
    disconnectClients(trackedClients);
    trackedClients.length = 0;
    resetServerStateForTests();
});

after(async () => {
    await stopServer();
});

test('scripted bot-heavy elimination path reaches a clean game over', { timeout: 60000 }, async () => {
    const { host, startedState, hostPlayerId } = await bootstrapBotMatch(3);
    const errors = [];
    let latestState = startedState;

    host.socket.on('game-error', (payload) => {
        errors.push(payload?.message || 'Unknown game error');
    });
    host.socket.on('game-state-sync', (state) => {
        latestState = state || latestState;
    });
    host.socket.on('turn-changed', (payload) => {
        latestState = payload?.gameState || latestState;
    });
    host.socket.on('player-bankrupt', (payload) => {
        latestState = payload?.gameState || latestState;
    });

    const dominantBot = startedState.players.find((player) => player.isBot);
    assert.ok(dominantBot, 'match should include at least one bot');

    for (const player of startedState.players) {
        if (player.id === dominantBot.id) continue;
        latestState = await emitDevCommandAndWait(host.socket, {
            type: 'set-money',
            playerId: player.id,
            amount: 50
        });
    }

    latestState = await emitDevCommandAndWait(host.socket, {
        type: 'claim-color-group',
        playerId: dominantBot.id,
        colorGroup: 'orange'
    });

    for (const tileIndex of [16, 18, 19]) {
        latestState = await emitDevCommandAndWait(host.socket, {
            type: 'set-houses',
            tileIndex,
            houses: 5
        });
    }

    latestState = await emitDevCommandAndWait(host.socket, {
        type: 'set-current-turn',
        playerId: hostPlayerId
    });

    const debtEventPromise = Promise.race([
        waitForSocketEventMatching(
            host.socket,
            'bankruptcy-warning',
            (payload) => payload?.playerId === hostPlayerId,
            10000
        ),
        waitForSocketEventMatching(
            host.socket,
            'player-bankrupt',
            (payload) => payload?.playerId === hostPlayerId,
            10000
        )
    ]);

    latestState = await emitDevCommandAndWait(host.socket, {
        type: 'set-position',
        playerId: hostPlayerId,
        tileIndex: 16
    });
    latestState = (await debtEventPromise)?.gameState || latestState;

    const gameOverPromise = waitForSocketEvent(host.socket, 'game-over', 15000);

    if (latestState.players.find((player) => player.id === hostPlayerId)?.isActive) {
        const bankruptPromise = waitForSocketEventMatching(
            host.socket,
            'player-bankrupt',
            (payload) => payload?.playerId === hostPlayerId,
            10000
        );
        host.socket.emit('declare-bankruptcy');
        latestState = (await bankruptPromise)?.gameState || latestState;
    }

    for (const bot of latestState.players.filter((player) => player.isBot && player.id !== dominantBot.id && player.isActive)) {
        latestState = await emitDevCommandAndWait(host.socket, {
            type: 'force-bankrupt-bot',
            playerId: bot.id
        });
    }

    const gameOver = await gameOverPromise;

    assert.equal(errors.length, 0, `simulation emitted errors: ${errors.join(' | ')}`);
    assert.ok(gameOver?.winner?.id, 'game-over should include a winner');
    assert.equal(gameOver.winner.id, dominantBot.id, 'dominant bot should win the scripted elimination path');
    assert.ok(Array.isArray(gameOver?.summary?.placements), 'game-over should include summary placements');
    assert.ok(gameOver.summary.placements.length >= 2, 'summary should rank the players');
});
