import { ProxyConfig } from './config';
import logger from './logger';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { Agent } from 'http';

export interface ProxyServer {
  server: string;
  username?: string;
  password?: string;
}

export class ProxyManager {
  private config: ProxyConfig;
  private sessionId: string | null = null;
  private currentUrl: string | null = null;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  /**
   * Set the current URL for proxy password selection
   */
  setCurrentUrl(url: string): void {
    this.currentUrl = url;
  }

  /**
   * Get the current URL
   */
  getCurrentUrl(): string | null {
    return this.currentUrl;
  }

  /**
   * Select password based on URL domain
   * Non-.de URLs use passwordNonDE, .de URLs use passwordDE
   */
  private selectPassword(url?: string | null): string {
    const targetUrl = url || this.currentUrl;
    const { passwordDE, passwordNonDE } = this.config;

    // If URL is non-.de, use passwordNonDE, otherwise use passwordDE
    if (targetUrl && !targetUrl.includes('.de')) {
      return passwordNonDE;
    }
    return passwordDE;
  }

  /**
   * Get a proxy URL with randomized IP for each request
   * If URL is non-.de: uses passwordNonDE
   * If URL is .de or no URL: uses passwordDE
   */
  getProxyServer(url?: string): ProxyServer {
    const targetUrl = url || this.currentUrl;
    const { host, port, username } = this.config;

    if (!username || !this.config.passwordDE || !this.config.passwordNonDE) {
      logger.warn('Proxy credentials not configured');
      return { server: `http://${host}:${port}` };
    }

    const proxyPassword = this.selectPassword(targetUrl);

    if (targetUrl) {
      if (!targetUrl.includes('.de')) {
        logger.info(`Using non-.de proxy password for: ${targetUrl}`);
      } else {
        logger.info(`Using .de proxy password for: ${targetUrl}`);
      }
    }

    return {
      server: `http://${host}:${port}`,
      username,
      password: proxyPassword,
    };
  }

  /**
   * Get a proxy URL with sticky session (same IP for multiple requests)
   * If URL is non-.de: uses passwordNonDE
   * If URL is .de or no URL: uses passwordDE
   * @param sessionLifetime Lifetime in minutes
   * @param url Optional URL to check for domain-specific password
   */
  getStickyProxyServer(sessionLifetime: number = 10, url?: string): ProxyServer {
    const targetUrl = url || this.currentUrl;
    const { host, port, username } = this.config;

    if (!username || !this.config.passwordDE || !this.config.passwordNonDE) {
      logger.warn('Proxy credentials not configured');
      return { server: `http://${host}:${port}` };
    }

    // Generate session ID if not exists
    if (!this.sessionId) {
      this.sessionId = Math.random().toString(36).substring(2, 15);
    }

    const basePassword = this.selectPassword(targetUrl);
    const modifiedPassword = `${basePassword}_session-${this.sessionId}_lifetime-${sessionLifetime}`;

    if (targetUrl) {
      if (!targetUrl.includes('.de')) {
        logger.info(`Using sticky non-.de proxy password for: ${targetUrl}`);
      } else {
        logger.info(`Using sticky .de proxy password for: ${targetUrl}`);
      }
    }

    return {
      server: `http://${host}:${port}`,
      username,
      password: modifiedPassword,
    };
  }

  /**
   * Clear the sticky session
   */
  clearSession(): void {
    this.sessionId = null;
  }

  /**
   * Test proxy connectivity to a specific target URL using HttpsProxyAgent
   */
  async testTargetUrl(targetUrl: string): Promise<{ accessible: boolean; statusCode?: number; responseTime: number; error?: string }> {
    const startTime = Date.now();
    try {
      const axios = require('axios');
      
      // Set current URL for password selection
      this.setCurrentUrl(targetUrl);

      // Create proxy agent with domain-specific password
      const agent = this.createProxyAgent(targetUrl);

      const response = await axios.get(targetUrl, {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 30000,
        maxRedirects: 5,
      });

      const responseTime = Date.now() - startTime;
      const passwordType = !targetUrl.includes('.de') ? 'non-.de' : '.de';
      
      logger.info(`Target URL test successful with ${passwordType} password. Status: ${response.status}, Time: ${responseTime}ms`);
      
      return {
        accessible: true,
        statusCode: response.status,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = (error as any)?.response?.status 
        ? `HTTP ${(error as any).response.status}` 
        : (error as Error).message;
      
      logger.error(`Target URL test failed for ${targetUrl}`, { 
        error: errorMessage,
        responseTime,
      });
      
      return {
        accessible: false,
        statusCode: (error as any)?.response?.status,
        responseTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Test proxy connectivity using HttpsProxyAgent
   */
  async testProxy(url?: string): Promise<boolean> {
    try {
      const axios = require('axios');
      const targetUrl = url || this.currentUrl;

      // Create proxy agent with domain-specific password
      const agent = this.createProxyAgent(targetUrl);

      const response = await axios.get('https://ipv4.icanhazip.com/', {
        httpAgent: agent,
        httpsAgent: agent,
        timeout: 10000,
      });

      const ip = response.data.trim();
      const passwordType = targetUrl && !targetUrl.includes('.de') ? 'non-.de' : '.de';
      logger.info(`Proxy test successful with ${passwordType} password. IP: ${ip}`);
      return true;
    } catch (error) {
      logger.error('Proxy test failed', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * Create HttpsProxyAgent for proxying HTTPS requests through HTTP proxy
   * Constructs agent with proper hostname, port, auth credentials, and domain-specific password
   */
  createProxyAgent(url?: string | null): Agent {
    const targetUrl = url || this.currentUrl;

    // Validate credentials are available
    if (!this.config.username) {
      throw new Error('Proxy username not configured');
    }
    
    if (!this.config.passwordDE && !this.config.passwordNonDE) {
      throw new Error('Proxy passwords not configured. Set PROXY_PASS_DE and PROXY_PASS_NON_DE environment variables.');
    }

    const proxyPassword = this.selectPassword(targetUrl);
    
    // Ensure password is not empty
    if (!proxyPassword) {
      throw new Error('Selected proxy password is empty');
    }

    // Build a proxy URL string (encode username/password to be safe)
    const encodedUser = encodeURIComponent(this.config.username);
    const encodedPass = encodeURIComponent(proxyPassword);
    const proxyUrlString = `http://${encodedUser}:${encodedPass}@${this.config.host}:${this.config.port}`;

    const agent = new HttpsProxyAgent(proxyUrlString);

    const passwordType = targetUrl && !targetUrl.includes('.de') ? 'non-.de' : '.de';
    const urlDisplay = targetUrl || 'default';
    logger.info(`Created proxy agent with ${passwordType} password for URL: ${urlDisplay}`);

    return agent as Agent;
  }
}
