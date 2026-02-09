import { chromium, Browser, BrowserContext, Page } from 'playwright';
import logger from './logger';
import { ProxyConfig, getFormValuesConfig } from './config';
import { ProxyManager } from './proxy-manager';
import { delay, getRandomUserAgent, getRandomViewport, randomInt, weightedRandom, randomChoice } from './utils';

interface UsabillaCheckResult {
  usabilla_live: boolean;
  ua_object: boolean;
  usabilla_scripts: string[];
}

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
        proxy: proxyServer.server
          ? {
              server: proxyServer.server,
              username: proxyServer.username,
              password: proxyServer.password,
            }
          : undefined,
      });
      logger.info('Browser initialized with proxy support');
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

    let context: BrowserContext | null = null;
    let page: Page | null = null;

    try {
      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      // Create a fresh browser context with cleared cookies (per-visit isolation)
      context = await this.browser.newContext({
        userAgent: getRandomUserAgent(),
        viewport: getRandomViewport(),
        locale: 'de-DE',
      });

      // Clear cookies before visit to ensure clean state
      await context.clearCookies();

      page = await context.newPage();

      // Navigate to URL
      logger.info(`Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForLoadState('networkidle');
      await delay(2000);

      // Handle cookie consent modal if it appears
      await this.acceptCookiesIfPresent(page);

      // Scroll page for 3-4 minutes while checking for Usabilla
      const surveyTriggered = await this.scrollAndWaitForUsabilla(page);

      if (!surveyTriggered) {
        throw new Error('Survey widget not found after scrolling');
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
    } catch (error) {
      result.status = 'failed';
      result.error = (error as Error).message;
      logger.error(`Survey failed for ${url}`, { error: (error as Error).message });

      try {
        if (page) {
          result.screenshot = await page.screenshot({ fullPage: true });
        }
      } catch {
        // Ignore screenshot errors
      }
    } finally {
      // Always close the context to ensure clean state for next run
      if (page) await page.close();
      if (context) await context.close();
    }

    result.duration = Date.now() - startTime;
    this.results.push(result);
    return result;
  }

  private async scrollAndWaitForUsabilla(page: Page, maxDurationMs: number = 7 * 60 * 1000): Promise<boolean> {
    try {
      logger.info(`🔍 Scrolling page for up to ${Math.round(maxDurationMs / 1000)} seconds while checking for Usabilla`);
      const startTime = Date.now();
      const scrollIntervalMs = 5000; // Check Usabilla every 5 seconds

      while (Date.now() - startTime < maxDurationMs) {
        // Enhanced Usabilla detection (from attachment)
        const usabillaCheckResult: UsabillaCheckResult = await page.evaluate(() => {
          return {
            usabilla_live: typeof (window as any).usabilla_live !== 'undefined',
            ua_object: typeof (window as any)._ua !== 'undefined',
            usabilla_scripts: Array.from(document.scripts)
              .map(script => script.src)
              .filter(src => Boolean(src && src.includes('usabilla')))
          };
        });

        logger.info('🔎 Usabilla check:', usabillaCheckResult);

        // Trigger survey if any Usabilla indicator detected
        if (usabillaCheckResult.usabilla_live || 
            usabillaCheckResult.ua_object || 
            usabillaCheckResult.usabilla_scripts.length > 0) {
          logger.info('🎯 Usabilla detected on page!');
          return await this.triggerSurvey(page);
        }

        // Scroll using mouse wheel for more realistic behavior
        await page.mouse.wheel(0, 4000);
        await delay(scrollIntervalMs);
      }

      logger.info('❌ Usabilla NOT detected within timeout period');
      return false;
    } catch (error) {
      logger.warn('Error during scroll and wait for Usabilla', { error: (error as Error).message });
      return false;
    }
  }

  private async acceptCookiesIfPresent(page: Page): Promise<void> {
    try {
      // Try specific strict selector first (from attachment)
      const strictSelector = 'a#_psaihm_id_accept_all_btn';
      try {
        const acceptCookiesLink = page.locator(strictSelector);
        await acceptCookiesLink.waitFor({ state: 'visible', timeout: 20000 });
        await acceptCookiesLink.click();
        // Ensure CMP overlay is gone
        await acceptCookiesLink.waitFor({ state: 'detached', timeout: 20000 });
        logger.info('✅ Cookies accepted via strict accept-all link');
        return;
      } catch {
        logger.info('ℹ️ Strict cookie accept link not found');
      }

      // Fallback: Common cookie consent selectors
      const cookieSelectors = [
        'button[class*="cookie-accept"]',
        'button[class*="accept-all"]',
        'button[class*="accept-cookies"]',
        'button[id*="cookie-accept"]',
        'button[id*="accept"]',
        '.gdpr-cookie-consent button[class*="accept"]',
        'button[class*="onetrust-accept"]',
        '#onetrust-accept-btn-handler',
        'button[class*="CookieConsent-accept"]',
      ];

      for (const selector of cookieSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            logger.info(`Found cookie consent button: ${selector}`);
            await element.click();
            await delay(500);
            logger.info('Cookie consent accepted');
            return;
          }
        } catch {
          // Continue to next selector
        }
      }

      logger.info('⚠️ No cookie consent modal found — Usabilla may be blocked');
    } catch (error) {
      logger.warn('Error attempting to accept cookies', { error: (error as Error).message });
    }
  }



  private async triggerSurvey(page: Page): Promise<boolean> {
    try {
      await delay(1000);

      // Trigger Usabilla survey
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
        // Wait for survey form to appear
        await page.waitForSelector('[class*="usabilla"]', { timeout: 5000 }).catch(() => {});
        await delay(1500);
        
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
    } catch (error) {
      logger.warn('Error triggering survey', { error: (error as Error).message });
      return false;
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
