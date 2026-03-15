const { test, expect } = require('@playwright/test');

async function selectFirstAvailableCharacter(page) {
    const selector = page.locator('.tcg-card-wrapper:not(.taken) .tcg-select-btn');
    await expect(selector.first()).toBeVisible({ timeout: 30000 });
    await selector.first().click();
}

test('host can create room, add a bot, and start a match', async ({ page }) => {
    await page.goto('/');
    await page.locator('#create-room-btn').click();

    await selectFirstAvailableCharacter(page);

    const addBotButton = page.locator('#add-bot-btn');
    await expect(addBotButton).toBeEnabled({ timeout: 15000 });
    await addBotButton.click();

    const startButton = page.locator('#start-game-btn');
    await expect(startButton).toBeEnabled({ timeout: 15000 });
    await startButton.click();

    await expect(page.locator('#roll-dice-btn')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#turn-indicator')).toContainText(/turn/i, { timeout: 30000 });
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

        const roomCode = await hostPage.evaluate(() => {
            return new URL(window.location.href).searchParams.get('room');
        });
        expect(roomCode).toBeTruthy();

        await guestPage.goto(`/?room=${roomCode}`);
        await selectFirstAvailableCharacter(guestPage);

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
