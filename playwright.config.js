const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './test/e2e',
    timeout: 45000,
    expect: {
        timeout: 10000
    },
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    reporter: [
        ['list'],
        ['html', { open: 'never' }]
    ],
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome']
            }
        }
    ],
    webServer: {
        command: 'npm run start:test',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: {
            PORT: '4173',
            NODE_ENV: 'test'
        }
    }
});
