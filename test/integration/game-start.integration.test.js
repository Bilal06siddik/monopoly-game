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
    disconnectClients
} = require('../helpers/socketHarness');

let port = null;
const trackedClients = [];

function track(client) {
    trackedClients.push(client);
    return client;
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

test('host can start a match when two players are ready', async () => {
    const roomCode = randomRoomCode('GS');

    const host = track(await connectClient({ port, roomCode }));
    const guest = track(await connectClient({ port, roomCode }));

    await selectCharacter(host.socket, 'bilo');
    await selectCharacter(guest.socket, 'osss');

    const hostStartedPromise = waitForSocketEvent(host.socket, 'gameStarted');
    const guestStartedPromise = waitForSocketEvent(guest.socket, 'gameStarted');

    host.socket.emit('requestStartGame');

    const hostState = await hostStartedPromise;
    const guestState = await guestStartedPromise;

    assert.equal(hostState.isGameStarted, true);
    assert.equal(guestState.isGameStarted, true);
    assert.equal(hostState.players.length, 2);
    assert.equal(guestState.players.length, 2);

    const hostPlayer = hostState.players.find((player) => player.character === 'bilo');
    assert.ok(hostPlayer, 'host character should exist in game state payload');
    assert.equal(hostPlayer.position, 0);
    assert.equal(hostPlayer.money, 1500);
});

test('bots stay flagged as bots after game start', async () => {
    const roomCode = randomRoomCode('BOT');

    const host = track(await connectClient({ port, roomCode }));
    await selectCharacter(host.socket, 'bilo');

    const lobbyUpdatePromise = waitForSocketEventMatching(
        host.socket,
        'lobby-update',
        (payload) => Array.isArray(payload?.players) && payload.players.some((player) => player.isBot),
        5000
    );
    host.socket.emit('add-random-bot');
    const lobbyState = await lobbyUpdatePromise;

    const lobbyBot = lobbyState.players.find((player) => player.isBot);
    assert.ok(lobbyBot, 'bot should appear in lobby payload');

    const startedPromise = waitForSocketEvent(host.socket, 'gameStarted');
    host.socket.emit('requestStartGame');
    const startedState = await startedPromise;

    const startedBot = startedState.players.find((player) => player.id === lobbyBot.id);
    assert.ok(startedBot, 'bot should be promoted into game-start payload');
    assert.equal(startedBot.isBot, true, 'bot flag should remain true in live game state');
});

test('host cannot start a match with fewer than two players', async () => {
    const roomCode = randomRoomCode('ERR');

    const host = track(await connectClient({ port, roomCode }));
    await selectCharacter(host.socket, 'bilo');

    const errorPromise = waitForSocketEvent(host.socket, 'game-error');
    host.socket.emit('requestStartGame');

    const error = await errorPromise;
    assert.match(error.message, /Need at least 2 players to start/i);
});

test('non-host players cannot start the match', async () => {
    const roomCode = randomRoomCode('HOST');

    const host = track(await connectClient({ port, roomCode }));
    const guest = track(await connectClient({ port, roomCode }));

    await selectCharacter(host.socket, 'bilo');
    await selectCharacter(guest.socket, 'osss');

    const errorPromise = waitForSocketEvent(guest.socket, 'game-error');
    guest.socket.emit('requestStartGame');

    const error = await errorPromise;
    assert.match(error.message, /Only the room host can start the match/i);
});
