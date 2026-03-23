const { test, expect } = require('@playwright/test');

async function selectFirstAvailableCharacter(page) {
    await page.waitForFunction(() => {
        const grid = document.getElementById('character-grid');
        return Boolean(grid && grid.querySelector('.tcg-card-wrapper:not(.taken) .tcg-select-btn'));
    }, { timeout: 30000 });

    const selector = page.locator('.tcg-card-wrapper:not(.taken) .tcg-select-btn');
    await expect(selector.first()).toBeVisible({ timeout: 30000 });
    await selector.first().click();
    await expect(page.locator('#confirm-character-btn')).toBeEnabled({ timeout: 15000 });
    await page.locator('#confirm-character-btn').click();
}

async function readyUp(page) {
    const readyButton = page.locator('#ready-toggle-btn');
    await expect(readyButton).toBeEnabled({ timeout: 15000 });
    await readyButton.click();
}

async function waitForTestApi(page) {
    await page.waitForFunction(() => Boolean(window.__MONOPOLY_TEST_API), { timeout: 30000 });
}

async function getSnapshot(page) {
    return page.evaluate(() => window.__MONOPOLY_TEST_API.getGameplaySnapshot());
}

async function runDevCommand(page, type, payload = {}) {
    await page.evaluate(({ nextType, nextPayload }) => {
        window.__MONOPOLY_TEST_API.runDevCommand(nextType, nextPayload);
    }, { nextType: type, nextPayload: payload });
}

async function emitGameEvent(page, eventName, payload = {}) {
    await page.evaluate(({ nextEventName, nextPayload }) => {
        window.__MONOPOLY_TEST_API.emit(nextEventName, nextPayload);
    }, { nextEventName: eventName, nextPayload: payload });
}

async function waitForSnapshot(page, predicate, timeout = 15000) {
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeout) {
        const snapshot = await getSnapshot(page);
        if (predicate(snapshot)) {
            return snapshot;
        }
        await page.waitForTimeout(100);
    }
    throw new Error(`Timed out waiting for gameplay snapshot after ${timeout}ms`);
}

async function startHostedBotMatch(page) {
    await page.goto('/?dev=1');
    await waitForTestApi(page);
    await page.locator('#create-room-btn').click();
    await selectFirstAvailableCharacter(page);
    await readyUp(page);

    const addBotButton = page.locator('#add-bot-btn');
    await expect(addBotButton).toBeEnabled({ timeout: 15000 });
    await addBotButton.click();

    const startButton = page.locator('#start-game-btn');
    await expect(startButton).toBeEnabled({ timeout: 15000 });
    await startButton.click();

    await expect(page.locator('#roll-dice-btn')).toBeVisible({ timeout: 30000 });
    await waitForSnapshot(page, (snapshot) => Boolean(snapshot?.gameState?.isGameStarted), 30000);
}

test('simulation tour covers core visual states without runtime errors', async ({ page }) => {
    test.setTimeout(90000);

    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });
    page.on('pageerror', (error) => {
        consoleErrors.push(error.message);
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await startHostedBotMatch(page);

    const startedSnapshot = await getSnapshot(page);
    const hostId = startedSnapshot.myPlayerId;
    const bot = startedSnapshot.gameState.players.find((player) => player.id !== hostId);
    expect(bot).toBeTruthy();

    await page.screenshot({ path: 'artifacts/simulation-state-gameplay.png', fullPage: true });

    await runDevCommand(page, 'set-current-turn', { playerId: hostId });
    await runDevCommand(page, 'set-position', { playerId: hostId, tileIndex: 1 });
    await waitForSnapshot(page, (snapshot) => Boolean(snapshot?.ui?.buyPrompt), 15000);
    await expect(page.locator('#buy-modal')).toBeVisible();
    await page.screenshot({ path: 'artifacts/simulation-state-buy.png', fullPage: true });

    await emitGameEvent(page, 'pass-property');
    await waitForSnapshot(page, (snapshot) => Boolean(snapshot?.ui?.auctionState), 15000);
    await expect(page.locator('#auction-modal')).toBeVisible();
    await page.screenshot({ path: 'artifacts/simulation-state-auction.png', fullPage: true });

    await waitForSnapshot(page, (snapshot) => !snapshot?.ui?.auctionState, 20000);

    await runDevCommand(page, 'set-current-turn', { playerId: hostId });
    await runDevCommand(page, 'toggle-jail', { playerId: hostId });
    await waitForSnapshot(page, (snapshot) => {
        const me = snapshot?.gameState?.players?.find((player) => player.id === snapshot.myPlayerId);
        return Boolean(me?.inJail);
    }, 15000);
    await expect(page.locator('#jail-roll-btn')).toBeVisible();
    await page.screenshot({ path: 'artifacts/simulation-state-jail.png', fullPage: true });

    await runDevCommand(page, 'set-owner', { playerId: hostId, tileIndex: 1 });
    await runDevCommand(page, 'set-owner', { playerId: bot.id, tileIndex: 3 });
    await page.locator('#leaderboard-panel button:has-text("Trade")').first().click();
    await expect(page.locator('#trade-modal')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'artifacts/simulation-state-trade.png', fullPage: true });
    await page.locator('#trade-cancel-btn').click();
    await expect(page.locator('#trade-modal')).toBeHidden({ timeout: 15000 });

    await runDevCommand(page, 'force-bankrupt-bot', { playerId: bot.id });
    await expect(page.locator('#end-stats-screen')).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: 'artifacts/simulation-state-endgame.png', fullPage: true });

    expect(consoleErrors, `runtime errors: ${consoleErrors.join(' | ')}`).toEqual([]);
});
