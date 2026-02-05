// Initialization, trigger, iframe handling
import { Page, Frame } from '@playwright/test';

export async function waitForUsabilla(page: Page) {
  await page.waitForFunction(() => {
    return typeof (window as any).usabilla_live === 'function';
  }, { timeout: 15_000 });
}

export async function triggerUsabillaSurvey(page: Page, triggerId: string) {
  await page.evaluate((id) => {
    (window as any).usabilla_live('trigger', {
      trigger_id: id,
    });
  }, triggerId);
}

export async function getUsabillaFrame(page: Page): Promise<Frame> {
  const iframe = await page.waitForSelector('iframe[src*="usabilla"]', {
    timeout: 15_000,
  });
  const frame = await iframe.contentFrame();

  if (!frame) {
    throw new Error('Usabilla iframe not found');
  }

  return frame;
}
