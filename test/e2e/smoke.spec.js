const { test, expect } = require('@playwright/test');

test('home page loads and room controls are visible', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Monopoly Online/i);
    await expect(page.locator('#create-room-btn')).toBeVisible({ timeout: 25000 });
    await expect(page.locator('#join-room-btn')).toBeVisible({ timeout: 25000 });
});
