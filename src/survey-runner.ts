import { chromium, Browser, Page } from 'playwright';
import logger from './logger';
import { ProxyManager } from './proxy-manager';
import { getFormValuesConfig } from './config';
import { delay, getRandomUserAgent, getRandomViewport, randomInt, weightedRandom, randomChoice } from './utils';

export interface SurveyResult {
  url: string;
  timestamp: string;
  status: 'success' | 'failed';
  error?: string;
  ip?: string;
  duration: number;
  screenshot?: Buffer;
}

export class SurveyRunner {
  private proxyManager: ProxyManager;
  private browser: Browser | null = null;
  private results: SurveyResult[] = [];

  constructor(proxyManager: ProxyManager) {
    this.proxyManager = proxyManager;
  }

  async initialize(): Promise<void> {
    try {
      const proxyServer = this.proxyManager.getProxyServer();
      this.browser = await chromium.launch({
        headless: true,
        proxy: proxyServer.server ? {
          server: proxyServer.server,
          username: proxyServer.username,
          password: proxyServer.password,
        } : undefined,
      });
      logger.info('Browser initialized');
    } catch (error) {
      logger.error('Failed to initialize browser', { error: (error as Error).message });
      throw error;
    }
  }

  async runSurvey(url: string): Promise<SurveyResult> {
    const startTime = Date.now();
    const result: SurveyResult = {
      url,
      timestamp: new Date().toISOString(),
      status: 'failed',
      duration: 0,
    };

    try {
      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      const page = await this.browser.newPage({
        userAgent: getRandomUserAgent(),
        viewport: getRandomViewport(),
      });

      // Clear Usabilla cookies and storage
      await this.clearUsabillaCookies(page);

      // Navigate to URL
      logger.info(`Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait for Usabilla widget to load
      await page.waitForLoadState('networkidle');
      await delay(20_000);

      // Trigger the survey
      logger.info(`Triggering survey for ${url}`);
      const surveyTriggered = await this.triggerSurvey(page);

      if (!surveyTriggered) {
        throw new Error('Survey widget did not appear within 30s timeout');
      }

      // Fill and submit the survey
      await this.fillSurvey(page);

      result.status = 'success';
      logger.info(`Survey completed successfully for ${url}`);

      // Take screenshot
      try {
        result.screenshot = await page.screenshot({ fullPage: true });
      } catch {
        logger.warn('Failed to take screenshot');
      }

      await page.close();
    } catch (error) {
      result.status = 'failed';
      result.error = (error as Error).message;
      logger.error(`Survey failed for ${url}`, { error: (error as Error).message });

      try {
        const pages = this.browser?.contexts()[0]?.pages() || [];
        for (const page of pages) {
          try {
            result.screenshot = await page.screenshot({ fullPage: true });
          } catch {
            // Ignore screenshot errors
          }
          await page.close();
        }
      } catch {
        // Ignore cleanup errors
      }
    }

    result.duration = Date.now() - startTime;
    this.results.push(result);
    return result;
  }

  private async clearUsabillaCookies(page: Page): Promise<void> {
    const cookies = await page.context().cookies();
    const usabillaCookies = cookies.filter(
      (c) => c.name.includes('usabilla') || c.name.includes('ub_')
    );

    for (const cookie of usabillaCookies) {
      await page.context().clearCookies({ name: cookie.name });
    }

    // Clear storage
    await page.evaluate(() => {
        try{
            const keys = Object.keys(localStorage);
            for (const key of keys) {
                if (key.includes('usabilla') || key.includes('ub_')) {
                localStorage.removeItem(key);
                }
            }

        } catch {
                return null;
        }

    });
  }

  private async triggerSurvey(page: Page): Promise<boolean> {
    try {
      // Scroll through page until Usabilla appears
      await this.scrollUntilUsabillaShows(page);
      await delay(30_000);

      // Inject and trigger Usabilla survey
      const triggered = await page.evaluate(() => {
        return new Promise<boolean>((resolve) => {
          const checkAndTrigger = () => {
            if (typeof (window as any).usabilla_live === 'function') {
              try {
                (window as any).usabilla_live('trigger', 'a5f669c28be1979ab5e2785121a6e10b');
                resolve(true);
              } catch (e) {
                resolve(false);
              }
            } else {
              setTimeout(checkAndTrigger, 500);
            }
          };
          checkAndTrigger();
          setTimeout(() => resolve(false), 30000);
        });
      });

      if (triggered) {
        // Wait for survey form to appear and take screenshot
        await page.waitForSelector('[class*="usabilla"]', { timeout: 60_000 }).catch(() => {});
        await delay(10_000);
        
        // Take screenshot of initial survey state
        try {
          const screenshotPath = `./screenshots/survey-initial-${Date.now()}.png`;
          await page.screenshot({ path: screenshotPath, fullPage: true });
          logger.info(`Initial survey screenshot saved: ${screenshotPath}`);
        } catch (error) {
          logger.warn('Failed to take initial screenshot', { error: (error as Error).message });
        }
        
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private async scrollUntilUsabillaShows(page: Page, maxAttempts: number = 5): Promise<void> {
    try {
      let attempts = 0;
      while (attempts < maxAttempts) {
        // Check if Usabilla is visible
        const isUsabillaVisible = await page.evaluate(() => {
          const usabillaElement = document.querySelector('[class*="usabilla"]');
          if (!usabillaElement) return false;
          const rect = usabillaElement.getBoundingClientRect();
          return rect.top < window.innerHeight && rect.bottom > 0;
        });

        if (isUsabillaVisible) {
          logger.info('Usabilla widget found and visible');
          return;
        }

        // Scroll down smoothly
        await page.evaluate(() => {
          window.scrollBy({ top: 300, behavior: 'smooth' });
        });

        await delay(10_000);
        attempts++;
      }

      logger.info('Completed scrolling attempts for Usabilla widget');
    } catch (error) {
      logger.warn('Error during scroll until Usabilla', { error: (error as Error).message });
    }
  }

  private async fillSurvey(page: Page): Promise<void> {
    const formValues = getFormValuesConfig();
    const timestamp = Date.now();

    // Page 1: Overall Satisfaction (mood)
    await this.fillPage1(page, formValues);
    await this.takePageScreenshot(page, 'page1', timestamp);
    await delay(randomInt(1000, 3000));

    // Page 2: Sub-Satisfaction Matrix
    await this.fillPage2(page, formValues);
    await this.takePageScreenshot(page, 'page2', timestamp);
    await delay(randomInt(1000, 3000));

    // Page 3: Efficiency
    await this.fillPage3(page, formValues);
    await this.takePageScreenshot(page, 'page3', timestamp);
    await delay(randomInt(1000, 3000));

    // Page 4: Goal & Vehicle Type (final)
    await this.fillPage4(page, formValues);
    await this.takePageScreenshot(page, 'page4-submission', timestamp);
    await delay(randomInt(1000, 2000));

    logger.info('Survey form filled and submitted');
  }

  private async takePageScreenshot(page: Page, pageName: string, timestamp: number): Promise<void> {
    try {
      const screenshotPath = `./screenshots/survey-${pageName}-${timestamp}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info(`Page screenshot saved: ${screenshotPath}`);
    } catch (error) {
      logger.warn(`Failed to take screenshot for ${pageName}`, { error: (error as Error).message });
    }
  }

  private async fillPage1(page: Page, formValues: any): Promise<void> {
    const mood = weightedRandom(
      formValues.mood.values,
      formValues.mood.weights
    );

    logger.info(`Filling Page 1 - Mood rating: ${mood}`);

    // Click mood rating stars (1-5)
    try {
      const moodValue = parseInt(mood);
      const starSelector = `[class*="star"][data-rating="${moodValue}"]`;
      await page.click(starSelector).catch(() => {});
      logger.info(`Selected mood rating: ${moodValue}`);
    } catch (error) {
      logger.warn('Failed to click mood rating');
    }

    // Click next button
    await page.click('[class*="button"][class*="next"]').catch(() => {});
  }

  private async fillPage2(page: Page, formValues: any): Promise<void> {
    const fields = ['SAT_Ergonomics', 'SAT_Vehicle_Characteristics', 'SAT_Vehicle_Price'];

    logger.info('Filling Page 2 - Sub-Satisfaction Matrix');

    for (const field of fields) {
      if (formValues[field]) {
        const value = weightedRandom(
          formValues[field].values,
          formValues[field].weights
        );

        try {
          const selector = `[data-field="${field}"][data-rating="${value}"]`;
          await page.click(selector).catch(() => {});
          logger.info(`Selected ${field}: ${value}`);
        } catch {
          logger.warn(`Failed to select ${field}`);
        }
      }
    }

    await page.click('[class*="button"][class*="next"]').catch(() => {});
  }

  private async fillPage3(page: Page, formValues: any): Promise<void> {
    const netEasyScore = weightedRandom(
      formValues.Net_Easy_Score.values,
      formValues.Net_Easy_Score.weights
    );

    logger.info(`Filling Page 3 - Net Easy Score: ${netEasyScore}`);

    try {
      const selector = `[data-field="Net_Easy_Score"][data-rating="${netEasyScore}"]`;
      await page.click(selector).catch(() => {});
      logger.info(`Selected Net_Easy_Score: ${netEasyScore}`);
    } catch {
      logger.warn('Failed to select Net_Easy_Score');
    }

    await page.click('[class*="button"][class*="next"]').catch(() => {});
  }

  private async fillPage4(page: Page, formValues: any): Promise<void> {
    const vehicleType = randomChoice(formValues.USER_VEHICLE.values);
    const visitGoal = randomChoice(formValues.GOAL_Visit.values);

    logger.info(`Filling Page 4 - Vehicle: ${vehicleType}, Goal: ${visitGoal}`);

    try {
      const vehicleSelector = `[data-field="USER_VEHICLE"][value="${vehicleType}"]`;
      await page.click(vehicleSelector).catch(() => {});
      logger.info(`Selected vehicle type: ${vehicleType}`);
    } catch {
      logger.warn('Failed to select vehicle type');
    }

    try {
      const goalSelector = `[data-field="GOAL_Visit"][value="${visitGoal}"]`;
      await page.click(goalSelector).catch(() => {});
      logger.info(`Selected visit goal: ${visitGoal}`);
    } catch {
      logger.warn('Failed to select visit goal');
    }

    // Click submit button
    await page.click('[class*="button"][class*="submit"]').catch(() => {});
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      logger.info('Browser closed');
    }
  }

  getResults(): SurveyResult[] {
    return this.results;
  }
}
