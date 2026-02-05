// End-to-end survey automation
import { test, expect } from '@playwright/test';
import { clearUsabillaStorage } from '../utils/storage';
import {
  waitForUsabilla,
  triggerUsabillaSurvey,
  getUsabillaFrame,
} from '../utils/usabilla';



test('Complete Usabilla survey and capture screenshots', async ({ page }) => {
  // 1. Clear Usabilla data
  await clearUsabillaStorage(page);

  // 2. Navigate with proxy
  await page.goto('https://YOUR_SITE_URL');

  // 3. Wait for Usabilla to initialize
  await waitForUsabilla(page);

  // 4. Trigger survey
  await triggerUsabillaSurvey(page, 'YOUR_TRIGGER_ID');

  // 5. Switch to Usabilla iframe
  const frame = await getUsabillaFrame(page);

  // --- PAGE 1: Star rating ---
  await frame.click('[data-testid="rating-star-5"]');
  await frame.locator('body').screenshot({
    path: 'screenshots/page-1-rating.png',
  });
  await frame.click('button:has-text("Next")');

  // --- PAGE 2: Options ---
  await frame.check('input[type="radio"]:first-of-type');
  await frame.locator('body').screenshot({
    path: 'screenshots/page-2-options.png',
  });
  await frame.click('button:has-text("Next")');

  // --- PAGE 3: Text feedback ---
  await frame.fill('textarea', 'Automated Playwright feedback');
  await frame.locator('body').screenshot({
    path: 'screenshots/page-3-text.png',
  });

  // 6. Submit survey
  await frame.click('button:has-text("Submit")');

  // 7. Final confirmation screenshot
  await frame.locator('body').screenshot({
    path: 'screenshots/page-4-confirmation.png',
  });

  expect(true).toBeTruthy();
});
