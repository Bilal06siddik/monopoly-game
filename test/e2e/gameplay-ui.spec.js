const { test, expect } = require('@playwright/test');

async function selectFirstAvailableCharacter(page) {
    await page.waitForFunction(() => {
        const grid = document.getElementById('character-grid');
        return Boolean(grid && grid.querySelector('.tcg-card-wrapper:not(.taken) .tcg-select-btn'));
    }, { timeout: 30000 });

    const selector = page.locator('.tcg-card-wrapper:not(.taken) .tcg-select-btn');
    await expect(selector.first()).toBeVisible({ timeout: 30000 });
    await selector.first().click();
    const confirmButton = page.locator('#confirm-character-btn');
    await expect(confirmButton).toBeEnabled({ timeout: 15000 });
    await confirmButton.click();
}

async function readyUp(page) {
    const readyButton = page.locator('#ready-toggle-btn');
    await expect(readyButton).toBeEnabled({ timeout: 15000 });
    await readyButton.click();
}

async function startHostedBotMatch(page) {
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
}

async function openDevPanel(page) {
    const toggle = page.locator('#dev-panel-toggle');
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await toggle.click();
    await expect(page.locator('#dev-panel')).toBeVisible({ timeout: 15000 });
}

async function getBox(page, selector) {
    const locator = page.locator(selector);
    await expect(locator).toBeVisible({ timeout: 30000 });
    const box = await locator.boundingBox();
    expect(box).toBeTruthy();
    return box;
}

function boxesOverlap(first, second) {
    return !(
        first.x + first.width <= second.x ||
        second.x + second.width <= first.x ||
        first.y + first.height <= second.y ||
        second.y + second.height <= first.y
    );
}

async function expectNoOverlap(page, leftSelector, rightSelector) {
    const leftBox = await getBox(page, leftSelector);
    const rightBox = await getBox(page, rightSelector);
    expect(boxesOverlap(leftBox, rightBox)).toBeFalsy();
}

async function expectSupportedLayout(page, { compact = false } = {}) {
    await expect(page.locator('.gpu-top-bar')).toBeVisible();
    await expect(page.locator('#roll-dice-btn')).toBeVisible();
    await expect(page.locator('#leaderboard-panel')).toBeVisible();
    await expect(page.locator('#history-log-list')).toBeVisible();
    await expect(page.locator('#host-controls-toggle')).toBeVisible();

    await expect(page.locator('#persistent-host-controls')).toHaveCount(0);

    await expectNoOverlap(page, '.gpu-top-bar', '.gpu-action-zone');
    await expectNoOverlap(page, '.gpu-top-bar', '.gpu-feed-panel');
    await expectNoOverlap(page, '#leaderboard-panel', '.gpu-action-dock');

    await page.locator('#host-controls-toggle').click();
    await expect(page.locator('#persistent-host-controls')).toBeVisible();
    await expect(page.locator('.gpu-host-popup-card')).toContainText(/room & match/i);
    await expect(page.locator('.gpu-host-popup-card')).toContainText(/close/i);

    if (compact) {
        await expect(page.locator('#persistent-host-controls')).toContainText(/turn timer/i);
    }
}

test('gameplay HUD stays usable at the desktop breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await startHostedBotMatch(page);
    await expectSupportedLayout(page);
});

test('gameplay HUD stays usable at the tablet breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await startHostedBotMatch(page);
    await expectSupportedLayout(page, { compact: true });
});

test('gameplay HUD stays usable at the phone landscape breakpoint', async ({ page }) => {
    await page.setViewportSize({ width: 932, height: 430 });
    await startHostedBotMatch(page);
    await expectSupportedLayout(page, { compact: true });
});

test('portrait phones show the rotate gate over gameplay controls', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await startHostedBotMatch(page);

    await expect(page.locator('.gpu-rotate-gate')).toBeVisible();
    await expect(page.locator('.gpu-rotate-card')).toContainText(/rotate your phone/i);
    await expect(page.locator('#roll-dice-btn')).toBeAttached();
});

test('end stats stay visible until the player returns to the lobby', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await startHostedBotMatch(page);
    await openDevPanel(page);

    const playerOptions = page.locator('#dev-player-select option');
    await expect(playerOptions).toHaveCount(2, { timeout: 15000 });
    await page.locator('#dev-player-select').selectOption({ index: 1 });
    await page.locator('#dev-bankrupt-bot-btn').click();

    const endStats = page.locator('#end-stats-screen');
    await expect(endStats).toBeVisible({ timeout: 15000 });
    await expect(endStats).toContainText(/match complete/i);

    await page.waitForTimeout(1500);
    await expect(endStats).toBeVisible();
    await expect(page.locator('#es-return-btn')).toBeVisible();

    await page.locator('#es-return-btn').click();

    await expect(page.locator('#lobby-screen')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#game-hud')).toHaveClass(/hidden/, { timeout: 15000 });
    await expect(page.locator('#end-stats-screen')).toHaveCount(0);
});
