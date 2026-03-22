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

async function installVisibilityStateHarness(page) {
    await page.evaluate(() => {
        if (typeof window.__setTestVisibilityState === 'function') return;

        let simulatedVisibilityState = 'visible';

        Object.defineProperty(document, 'visibilityState', {
            configurable: true,
            get: () => simulatedVisibilityState
        });

        Object.defineProperty(document, 'hidden', {
            configurable: true,
            get: () => simulatedVisibilityState !== 'visible'
        });

        window.__setTestVisibilityState = (nextState) => {
            simulatedVisibilityState = nextState === 'hidden' ? 'hidden' : 'visible';
            document.dispatchEvent(new Event('visibilitychange'));
        };
    });
}

test('host can create room, add a bot, and start a match', async ({ page }) => {
    await page.goto('/');
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
    await expect(page.locator('#turn-indicator')).toContainText(/turn/i, { timeout: 30000 });
});

test('hidden tabs fast-forward active gameplay animations', async ({ page }) => {
    await page.goto('/');
    const createRoomButton = page.locator('#create-room-btn');
    if (await createRoomButton.isVisible().catch(() => false)) {
        await createRoomButton.click();
    }

    await selectFirstAvailableCharacter(page);

    const addBotButton = page.locator('#add-bot-btn');
    await expect(addBotButton).toBeEnabled({ timeout: 15000 });
    await addBotButton.click();

    const startButton = page.locator('#start-game-btn');
    await expect(startButton).toBeEnabled({ timeout: 15000 });
    await startButton.click();

    const rollButton = page.locator('#roll-dice-btn');
    await expect(rollButton).toBeVisible({ timeout: 30000 });
    await installVisibilityStateHarness(page);
    await rollButton.click({ force: true });
    await page.waitForTimeout(200);

    await page.evaluate(() => {
        window.__setTestVisibilityState('hidden');
    });
    await page.waitForTimeout(250);

    const hiddenState = await page.evaluate(() => {
        const tokens = Object.values(GameTokens.getAllTokens()).map((token) => ({
            animating: token.animating,
            currentTile: token.currentTile,
            y: token.group.position.y
        }));

        return {
            isRolling: GameDice.getIsRolling(),
            tokens
        };
    });

    expect(hiddenState.isRolling).toBeFalsy();
    expect(hiddenState.tokens.some((token) => token.animating)).toBeFalsy();
    expect(hiddenState.tokens.some((token) => token.currentTile !== 0)).toBeTruthy();

    await page.evaluate(() => {
        window.__setTestVisibilityState('visible');
    });
    await page.waitForTimeout(700);

    const visibleState = await page.evaluate(() => ({
        isRolling: GameDice.getIsRolling(),
        tokens: Object.values(GameTokens.getAllTokens()).map((token) => ({
            animating: token.animating,
            currentTile: token.currentTile
        }))
    }));

    expect(visibleState.isRolling).toBeFalsy();
    expect(visibleState.tokens.some((token) => token.animating)).toBeFalsy();
    await expect(rollButton).not.toHaveText(/Rolling|Resolving Move/i);
});

test('two clients can join same room and both enter the running match', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    try {
        await hostPage.goto('/');
        await hostPage.locator('#create-room-btn').click();
        await selectFirstAvailableCharacter(hostPage);
        await readyUp(hostPage);

        const roomCode = await hostPage.evaluate(() => {
            return new URL(window.location.href).searchParams.get('room');
        });
        expect(roomCode).toBeTruthy();

        await guestPage.goto(`/?room=${roomCode}`);
        await selectFirstAvailableCharacter(guestPage);
        await readyUp(guestPage);

        const startButton = hostPage.locator('#start-game-btn');
        await expect(startButton).toBeEnabled({ timeout: 20000 });
        await startButton.click();

        await expect(hostPage.locator('#roll-dice-btn')).toBeVisible({ timeout: 30000 });
        await expect(guestPage.locator('#roll-dice-btn')).toBeVisible({ timeout: 30000 });
    } finally {
        await hostContext.close();
        await guestContext.close();
    }
});
