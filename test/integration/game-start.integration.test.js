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
    assert.equal(hostState.rulePreset, 'capitalista_v2');
    assert.equal(hostState.rulesConfig.requireEvenBuilding, true);
    assert.equal(hostState.rulesConfig.loansEnabled, false);
    assert.equal(hostState.boardTemplateId, 'capitalista_reference_40');
    assert.equal(hostState.boardTheme, 'egypt');

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

test('lobby map votes decide which board starts', async () => {
    const roomCode = randomRoomCode('MAP');

    const host = track(await connectClient({ port, roomCode }));
    const guest = track(await connectClient({ port, roomCode }));

    await selectCharacter(host.socket, 'bilo');
    await selectCharacter(guest.socket, 'osss');

    const votedLobbyPromise = waitForSocketEventMatching(
        host.socket,
        'lobby-update',
        (payload) => payload?.selectedBoardId === 'countries',
        5000
    );

    host.socket.emit('vote-board-map', { boardId: 'countries' });
    const votedLobby = await votedLobbyPromise;

    assert.equal(votedLobby.selectedBoardId, 'countries');
    assert.equal(votedLobby.rulePreset, 'capitalista_v2');
    assert.equal(votedLobby.boardOptions.find((option) => option.id === 'countries')?.templateId, 'capitalista_reference_40');

    const startedPromise = waitForSocketEvent(host.socket, 'gameStarted');
    host.socket.emit('requestStartGame');
    const startedState = await startedPromise;

    assert.equal(startedState.boardId, 'countries');
    assert.equal(startedState.boardName, 'Countries');
    assert.equal(startedState.boardTheme, 'countries');
    assert.equal(startedState.properties[1].name, 'Delhi');
    assert.equal(startedState.properties[5].name, 'India Railroad');
});

test('developer rule-config toggles propagate through game-state sync', async () => {
    const roomCode = randomRoomCode('CFG');
    const host = track(await connectClient({ port, roomCode }));
    const guest = track(await connectClient({ port, roomCode }));

    await selectCharacter(host.socket, 'bilo');
    await selectCharacter(guest.socket, 'osss');

    const startedPromise = waitForSocketEvent(host.socket, 'gameStarted');
    host.socket.emit('requestStartGame');
    await startedPromise;

    const enabledSyncPromise = waitForSocketEventMatching(
        host.socket,
        'game-state-sync',
        (payload) => payload?.rulesConfig?.loansEnabled === true
            && payload?.rulesConfig?.ownedPropertyOvertakeEnabled === true,
        5000
    );

    host.socket.emit('dev-command', {
        type: 'set-rules-config',
        rulesConfig: {
            loansEnabled: true,
            ownedPropertyOvertakeEnabled: true
        }
    });

    const enabledSync = await enabledSyncPromise;
    assert.equal(enabledSync.rulesConfig.loansEnabled, true);
    assert.equal(enabledSync.rulesConfig.ownedPropertyOvertakeEnabled, true);

    const disabledSyncPromise = waitForSocketEventMatching(
        host.socket,
        'game-state-sync',
        (payload) => payload?.rulesConfig?.loansEnabled === false
            && payload?.rulesConfig?.ownedPropertyOvertakeEnabled === false,
        5000
    );

    host.socket.emit('dev-command', {
        type: 'set-rules-config',
        rulesConfig: {
            loansEnabled: false,
            ownedPropertyOvertakeEnabled: false
        }
    });

    const disabledSync = await disabledSyncPromise;
    assert.equal(disabledSync.rulesConfig.loansEnabled, false);
    assert.equal(disabledSync.rulesConfig.ownedPropertyOvertakeEnabled, false);
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
