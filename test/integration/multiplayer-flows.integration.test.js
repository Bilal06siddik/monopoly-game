const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
    startServer,
    stopServer,
    resetServerStateForTests
} = require('../../server');
const {
    wait,
    randomRoomCode,
    waitForSocketEvent,
    waitForSocketEventMatching,
    expectNoSocketEvent,
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

async function bootstrapMatch() {
    const roomCode = randomRoomCode('MP');
    const host = track(await connectClient({ port, roomCode }));
    const guest = track(await connectClient({ port, roomCode }));

    await selectCharacter(host.socket, 'bilo');
    await selectCharacter(guest.socket, 'osss');
    await setReadyState(host.socket, true);
    await setReadyState(guest.socket, true);

    const hostStartedPromise = waitForSocketEvent(host.socket, 'gameStarted');
    const guestStartedPromise = waitForSocketEvent(guest.socket, 'gameStarted');
    host.socket.emit('requestStartGame');

    const hostState = await hostStartedPromise;
    const guestState = await guestStartedPromise;
    return { roomCode, host, guest, hostState, guestState };
}

function getCurrentTurnPair(match) {
    const hostPlayer = match.hostState.players.find((player) => player.character === 'bilo');
    const guestPlayer = match.hostState.players.find((player) => player.character === 'osss');
    assert.ok(hostPlayer);
    assert.ok(guestPlayer);

    const actor = match.hostState.currentPlayerId === hostPlayer.id
        ? match.host
        : match.guest;
    const target = actor === match.host ? match.guest : match.host;
    const actorId = actor === match.host ? hostPlayer.id : guestPlayer.id;
    const targetId = target === match.host ? hostPlayer.id : guestPlayer.id;
    return { actor, actorId, target, targetId };
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

test('new turns start with a short roll timer window', async () => {
    const { hostState } = await bootstrapMatch();

    assert.ok(hostState.turnTimer, 'game start payload should include turn timer state');
    assert.equal(hostState.turnTimer.phase, 'waiting');
    assert.ok(hostState.turnTimer.remainingSeconds <= 30 && hostState.turnTimer.remainingSeconds >= 29);
});

test('active turn actions extend the waiting timer window', async () => {
    const match = await bootstrapMatch();
    const { actor, actorId, target, targetId } = getCurrentTurnPair(match);

    const boostedTimerPromise = waitForSocketEventMatching(
        actor.socket,
        'turn-timer-tick',
        (payload) => payload?.phase === 'waiting'
            && payload?.currentPlayerId === actorId
            && Number(payload?.remainingSeconds) >= 59,
        5000
    );
    const incomingTradePromise = waitForSocketEvent(target.socket, 'trade-incoming');

    actor.socket.emit('trade-offer', {
        targetId,
        offerProperties: [],
        offerCash: 1,
        requestProperties: [],
        requestCash: 0
    });

    await incomingTradePromise;
    const boostedTimer = await boostedTimerPromise;
    assert.ok(Number(boostedTimer.remainingSeconds) >= 59);
});

test('buying and done phases use short default timer windows', async () => {
    const match = await bootstrapMatch();
    const { actor, actorId } = getCurrentTurnPair(match);

    const buyingTimerPromise = waitForSocketEventMatching(
        actor.socket,
        'turn-timer-start',
        (payload) => payload?.phase === 'buying' && payload?.currentPlayerId === actorId,
        5000
    );

    actor.socket.emit('dev-command', {
        type: 'set-position',
        playerId: actorId,
        tileIndex: 1
    });

    const buyingTimer = await buyingTimerPromise;
    assert.ok(Number(buyingTimer.remainingSeconds) <= 25 && Number(buyingTimer.remainingSeconds) >= 24);

    const doneTimerPromise = waitForSocketEventMatching(
        actor.socket,
        'turn-timer-start',
        (payload) => payload?.phase === 'done' && payload?.currentPlayerId === actorId,
        5000
    );

    actor.socket.emit('buy-property', { tileIndex: 1 });

    const doneTimer = await doneTimerPromise;
    assert.ok(Number(doneTimer.remainingSeconds) <= 25 && Number(doneTimer.remainingSeconds) >= 24);
});

test('host can disable and re-enable turn timer during a live match', async () => {
    const { host, guest } = await bootstrapMatch();

    const timerStoppedPromise = waitForSocketEvent(guest.socket, 'turn-timer-stop', 5000);
    const disabledSyncPromise = waitForSocketEventMatching(
        host.socket,
        'game-state-sync',
        (payload) => payload?.turnTimerEnabled === false && payload?.turnTimer === null,
        5000
    );

    host.socket.emit('host-set-turn-timer-enabled', { enabled: false });

    await timerStoppedPromise;
    const disabledState = await disabledSyncPromise;
    assert.equal(disabledState.turnTimerEnabled, false);
    await expectNoSocketEvent(host.socket, 'turn-timer-tick', 1200);

    const timerRestartedPromise = waitForSocketEventMatching(
        host.socket,
        'turn-timer-start',
        (payload) => payload?.phase === 'waiting' && Number(payload?.remainingSeconds) >= 29,
        5000
    );
    const enabledSyncPromise = waitForSocketEventMatching(
        host.socket,
        'game-state-sync',
        (payload) => payload?.turnTimerEnabled === true && payload?.turnTimer,
        5000
    );

    host.socket.emit('host-set-turn-timer-enabled', { enabled: true });

    const restartedTimer = await timerRestartedPromise;
    const enabledState = await enabledSyncPromise;

    assert.equal(enabledState.turnTimerEnabled, true);
    assert.ok(Number(restartedTimer.remainingSeconds) >= 29);
});

test('host can extend the active turn timer mid-turn', async () => {
    const match = await bootstrapMatch();
    const { actorId } = getCurrentTurnPair(match);

    const baselineTick = await waitForSocketEventMatching(
        match.host.socket,
        'turn-timer-tick',
        (payload) => payload?.phase === 'waiting'
            && payload?.currentPlayerId === actorId
            && Number(payload?.remainingSeconds) <= 29,
        5000
    );
    assert.ok(Number(baselineTick.remainingSeconds) <= 29);

    const extendedTickPromise = waitForSocketEventMatching(
        match.host.socket,
        'turn-timer-tick',
        (payload) => payload?.phase === 'waiting'
            && payload?.currentPlayerId === actorId
            && Number(payload?.remainingSeconds) >= 58,
        5000
    );

    match.host.socket.emit('host-extend-turn-timer', { seconds: 30 });

    const extendedTick = await extendedTickPromise;
    assert.ok(Number(extendedTick.remainingSeconds) >= 58);
});

test('non-host players cannot change timer host controls', async () => {
    const { host, guest } = await bootstrapMatch();

    const hostTimerShouldKeepRunning = expectNoSocketEvent(host.socket, 'turn-timer-stop', 700);
    const hostErrorPromise = waitForSocketEventMatching(
        guest.socket,
        'game-error',
        (payload) => /only the room host can change timer settings/i.test(payload?.message || ''),
        5000
    );

    guest.socket.emit('host-set-turn-timer-enabled', { enabled: false });

    const hostError = await hostErrorPromise;
    await hostTimerShouldKeepRunning;
    assert.match(hostError.message, /only the room host can change timer settings/i);
});

test('double roll-dice submissions only execute one roll and reject the duplicate', async () => {
    const { host, guest } = await bootstrapMatch();

    let diceRolledCount = 0;
    host.socket.on('dice-rolled', () => {
        diceRolledCount += 1;
    });

    const diceRolledPromise = waitForSocketEvent(host.socket, 'dice-rolled');
    const duplicateErrorPromise = waitForSocketEventMatching(
        host.socket,
        'game-error',
        (payload) => /cannot roll dice right now/i.test(payload?.message || ''),
        4000
    );

    host.socket.emit('roll-dice');
    host.socket.emit('roll-dice');

    const diceEvent = await diceRolledPromise;
    await duplicateErrorPromise;
    await wait(250);

    assert.equal(diceRolledCount, 1);
    assert.equal(diceEvent.gameState.turnPhase, 'moving');

    await expectNoSocketEvent(guest.socket, 'game-paused', 250);
});

test('trade offer acceptance transfers ownership to receiver', async () => {
    const { host, guest, hostState } = await bootstrapMatch();

    const hostPlayer = hostState.players.find((player) => player.character === 'bilo');
    const guestPlayer = hostState.players.find((player) => player.character === 'osss');
    assert.ok(hostPlayer);
    assert.ok(guestPlayer);

    const syncPromise = waitForSocketEvent(host.socket, 'game-state-sync');
    host.socket.emit('dev-command', {
        type: 'set-owner',
        playerId: hostPlayer.id,
        tileIndex: 1
    });
    const syncedState = await syncPromise;
    assert.equal(syncedState.properties[1].owner, hostPlayer.id);

    const tradeIncomingPromise = waitForSocketEvent(guest.socket, 'trade-incoming');
    host.socket.emit('trade-offer', {
        targetId: guestPlayer.id,
        offerProperties: [1],
        offerCash: 0,
        requestProperties: [],
        requestCash: 0
    });

    const incomingTrade = await tradeIncomingPromise;
    assert.equal(incomingTrade.fromId, hostPlayer.id);
    assert.equal(incomingTrade.toId, guestPlayer.id);

    const hostCompletedPromise = waitForSocketEvent(host.socket, 'trade-completed');
    const guestCompletedPromise = waitForSocketEvent(guest.socket, 'trade-completed');
    guest.socket.emit('trade-accept', { tradeId: incomingTrade.id });

    const hostCompleted = await hostCompletedPromise;
    const guestCompleted = await guestCompletedPromise;

    assert.equal(hostCompleted.gameState.properties[1].owner, guestPlayer.id);
    assert.equal(guestCompleted.gameState.properties[1].owner, guestPlayer.id);
});

test('disconnecting the active player pauses and reconnecting resumes the match', async () => {
    const { roomCode, host, guest, hostState } = await bootstrapMatch();

    const hostPlayer = hostState.players.find((player) => player.character === 'bilo');
    assert.ok(hostPlayer);
    assert.equal(hostState.currentPlayerId, hostPlayer.id);

    const pausedPromise = waitForSocketEvent(guest.socket, 'game-paused');
    host.socket.disconnect();
    const paused = await pausedPromise;

    assert.equal(paused.pauseState.playerId, hostPlayer.id);
    assert.equal(paused.pauseState.reason, 'player-disconnected');

    const resumedPromise = waitForSocketEvent(guest.socket, 'game-resumed');
    const reconnectedHost = track(await connectClient({
        port,
        roomCode,
        sessionToken: host.sessionToken
    }));
    const resumed = await resumedPromise;

    assert.equal(resumed.gameState.pauseState, null);
    assert.equal(reconnectedHost.session.playerId, hostPlayer.id);
});

test('move-complete from non-current player is ignored', async () => {
    const { host, guest } = await bootstrapMatch();

    const noTurnChangeOnHost = expectNoSocketEvent(host.socket, 'turn-changed', 300);
    const noTurnChangeOnGuest = expectNoSocketEvent(guest.socket, 'turn-changed', 300);

    guest.socket.emit('move-complete');

    await noTurnChangeOnHost;
    await noTurnChangeOnGuest;
});

test('late auction bid near timeout resolves to a consistent final state', async () => {
    const { host, guest, hostState } = await bootstrapMatch();

    const hostPlayer = hostState.players.find((player) => player.character === 'bilo');
    const guestPlayer = hostState.players.find((player) => player.character === 'osss');
    assert.ok(hostPlayer);
    assert.ok(guestPlayer);

    host.socket.emit('dev-command', {
        type: 'set-owner',
        playerId: hostPlayer.id,
        tileIndex: 1
    });
    await waitForSocketEvent(host.socket, 'game-state-sync');

    const auctionStartedPromise = waitForSocketEvent(host.socket, 'auction-started', 12000);
    host.socket.emit('own-auction', { tileIndex: 1, startPrice: 1 });
    const started = await auctionStartedPromise;
    assert.equal(started.auction.tileIndex, 1);

    const lateTickPromise = waitForSocketEventMatching(
        guest.socket,
        'auction-tick',
        (payload) => Number(payload?.timeRemaining) <= 1,
        15000
    );

    const lateTick = await lateTickPromise;
    assert.ok(lateTick.timeRemaining <= 1);

    // Place a bid in the final second to exercise bid-vs-timeout ordering.
    guest.socket.emit('place-bid', { amount: 3 });

    const ended = await waitForSocketEvent(host.socket, 'auction-ended', 15000);
    const finalState = ended.gameState;
    assert.ok(finalState, 'auction-ended should include final game state snapshot');

    const tile = finalState.properties[1];
    if (ended.winnerId) {
        assert.equal(ended.winnerId, guestPlayer.id);
        assert.equal(tile.owner, guestPlayer.id);
        const winner = finalState.players.find((player) => player.id === guestPlayer.id);
        assert.ok(winner.money >= 0);
    } else {
        assert.equal(tile.owner, null);
    }
});

test('custom avatar payloads over 2MB are rejected and valid payloads are accepted', async () => {
    const roomCode = randomRoomCode('CUST');
    const player = track(await connectClient({ port, roomCode }));

    const oversizeBytes = Buffer.alloc(5 * 1024 * 1024, 1).toString('base64');
    const oversizedAvatar = `data:image/png;base64,${oversizeBytes}`;

    const noConfirmPromise = expectNoSocketEvent(player.socket, 'character-confirmed', 500);
    const noDisconnectPromise = expectNoSocketEvent(player.socket, 'disconnect', 900);
    const oversizeErrorPromise = waitForSocketEventMatching(
        player.socket,
        'character-error',
        (payload) => /2mb or smaller/i.test(payload?.message || ''),
        4000
    );

    player.socket.emit('select-character', {
        name: 'custom',
        customName: 'BigImage',
        customAvatarUrl: oversizedAvatar
    });

    const oversizeError = await oversizeErrorPromise;
    await noConfirmPromise;
    await noDisconnectPromise;
    assert.match(oversizeError.message, /2MB or smaller/i);
    assert.equal(player.socket.connected, true);

    const validAvatar = `data:image/png;base64,${Buffer.from('ok-avatar').toString('base64')}`;
    const confirmedPromise = waitForSocketEvent(player.socket, 'character-confirmed', 4000);

    player.socket.emit('select-character', {
        name: 'custom',
        customName: 'PhotoHero',
        customAvatarUrl: validAvatar
    });

    const confirmed = await confirmedPromise;
    assert.equal(confirmed.character, 'custom');
    assert.equal(confirmed.customName, 'PhotoHero');
    assert.equal(confirmed.customAvatarUrl, validAvatar);
});
