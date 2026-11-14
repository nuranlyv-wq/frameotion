import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {chromium} from 'playwright';

test('public creation form sends the selected pace and the studio prevents incompatible combinations',
  {skip: !process.env.KADR_SUPER_UI_CHECK, timeout: 30000}, async () => {
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    const server = spawn(process.execPath, ['src/server.js'], {env: {...process.env, PORT: String(port)}, stdio: 'ignore'});
    let browser;
    try {
      const root = `http://127.0.0.1:${port}`;
      for (let attempt = 0; ; attempt++) {
        try { await fetch(root); break; }
        catch (error) {
          if (attempt === 49) throw error;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      browser = await chromium.launch({headless: true, executablePath: process.env.KADR_TEST_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args: ['--no-sandbox']});
      const page = await browser.newPage();
      await page.route('**/*',route=>new URL(route.request().url()).origin===root?route.continue():route.abort());
      page.setDefaultTimeout(5000);
      let submitted;
      await page.route('**/api/create', async route => {
        submitted = route.request().postDataJSON();
        await route.fulfill({status: 202, contentType: 'application/json', body: '{"id":"test-run"}'});
      });
      await page.route('**/api/create/test-run', route => route.fulfill({status: 200, contentType: 'application/json', body: '{"status":"running"}'}));
      await page.goto(root + '/motion.html', {waitUntil: 'domcontentloaded'});
      await page.selectOption('#pace', 'superdynamic');
      await page.fill('#url', 'https://example.com');
      await page.click('#generate');
      assert.equal(submitted.pace, 'superdynamic');
      assert.equal(submitted.mode, 'url');
      await page.goto(root + '/motion.html', {waitUntil: 'domcontentloaded'});
      await page.selectOption('[data-language-select]', 'en');
      assert.match(await page.locator('#pace option[value="superdynamic"]').textContent(), /Super dynamic/);
      await page.goto(root + '/studio.html', {waitUntil: 'domcontentloaded'});
      await page.waitForFunction(() => !document.querySelector('#superdynamicPace').disabled);
      await page.selectOption('#launchPace', 'superdynamic');
      await page.locator('details.advanced > summary').click();
      await page.selectOption('#motionRecipe', 'connected-story');
      assert.equal(await page.locator('#superdynamicPace').isDisabled(), true);
      assert.equal(await page.locator('#launchPace').inputValue(), 'dynamic');
    } finally {
      await browser?.close();
      server.kill('SIGTERM');
    }
  });
