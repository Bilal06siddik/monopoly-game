const { randomUUID } = require('crypto');
const { io: createClient } = require('socket.io-client');

const DEFAULT_TIMEOUT_MS = 10000;

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomRoomCode(prefix = 'ROOM') {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
    return `${prefix}${suffix}`.slice(0, 12);
}

function waitForSocketEvent(socket, eventName, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, handleEvent);
            reject(new Error(`Timed out waiting for event "${eventName}"`));
        }, timeoutMs);

        const handleEvent = (payload) => {
            clearTimeout(timer);
            resolve(payload);
        };

        socket.once(eventName, handleEvent);
    });
}

function waitForSocketEventMatching(socket, eventName, predicate, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, handleEvent);
            reject(new Error(`Timed out waiting for matching event "${eventName}"`));
        }, timeoutMs);

        const handleEvent = (payload) => {
            if (!predicate(payload)) {
                return;
            }

            clearTimeout(timer);
            socket.off(eventName, handleEvent);
            resolve(payload);
        };

        socket.on(eventName, handleEvent);
    });
}

function expectNoSocketEvent(socket, eventName, timeoutMs = 400) {
    return new Promise((resolve, reject) => {
        const handleEvent = (payload) => {
            clearTimeout(timer);
            socket.off(eventName, handleEvent);
            reject(new Error(`Unexpected "${eventName}" event: ${JSON.stringify(payload)}`));
        };

        const timer = setTimeout(() => {
            socket.off(eventName, handleEvent);
            resolve();
        }, timeoutMs);

        socket.on(eventName, handleEvent);
    });
}

function waitForSocketConnect(socket, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        if (socket.connected) {
            resolve();
            return;
        }

        const timer = setTimeout(() => {
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleError);
            reject(new Error('Timed out waiting for socket connection'));
        }, timeoutMs);

        const cleanup = () => {
            clearTimeout(timer);
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleError);
        };

        const handleConnect = () => {
            cleanup();
            resolve();
        };

        const handleError = (error) => {
            cleanup();
            reject(error);
        };

        socket.on('connect', handleConnect);
        socket.on('connect_error', handleError);
    });
}

async function connectClient({ port, roomCode, sessionToken = randomUUID(), timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const endpoint = `http://127.0.0.1:${port}`;
    const socket = createClient(endpoint, {
        auth: { roomCode, sessionToken },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
    });

    const sessionPromise = waitForSocketEvent(socket, 'player-session', timeoutMs);
    await waitForSocketConnect(socket, timeoutMs);
    const session = await sessionPromise;

    return { socket, session, sessionToken, roomCode };
}

function selectCharacter(socket, character, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const lobbyUpdatePromise = waitForSocketEvent(socket, 'lobby-update', timeoutMs);
    socket.emit('select-character', character);
    return lobbyUpdatePromise;
}

function disconnectClients(...clients) {
    clients.flat().forEach((client) => {
        const socket = client?.socket || client;
        if (socket?.connected) {
            socket.disconnect();
        }
    });
}

module.exports = {
    DEFAULT_TIMEOUT_MS,
    wait,
    randomRoomCode,
    waitForSocketEvent,
    waitForSocketEventMatching,
    expectNoSocketEvent,
    connectClient,
    selectCharacter,
    disconnectClients
};
