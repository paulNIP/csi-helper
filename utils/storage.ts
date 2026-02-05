// Clears Usabilla cookies, localStorage, and sessionStorage
import { Page } from '@playwright/test';

export async function clearUsabillaStorage(page: Page) {
  await page.context().clearCookies();

  await page.addInitScript(() => {
    Object.keys(localStorage).forEach(key => {
      if (key.toLowerCase().includes('usabilla')) {
        localStorage.removeItem(key);
      }
    });

    Object.keys(sessionStorage).forEach(key => {
      if (key.toLowerCase().includes('usabilla')) {
        sessionStorage.removeItem(key);
      }
    });
  });
}
