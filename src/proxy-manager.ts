import { ProxyConfig } from './config';
import logger from './logger';
import { HttpsProxyAgent } from 'https-proxy-agent';


export interface ProxyServer {
  server: string;
  username?: string;
  password?: string;
}

export class ProxyManager {
  private config: ProxyConfig;
  private sessionId: string | null = null;

  constructor(config: ProxyConfig) {
    this.config = config;
  }

  /**
   * Get a proxy URL with randomized IP for each request
   */
  getProxyServer(): ProxyServer {
    const { host, port, username, password } = this.config;

    if (!username || !password) {
      logger.warn('Proxy credentials not configured');
      return { server: `http://${host}:${port}` };
    }

    return {
      server: `http://${host}:${port}`,
      username,
      password,
    };
  }

  /**
   * Get a proxy URL with sticky session (same IP for multiple requests)
   * @param sessionLifetime Lifetime in minutes (e.g., 10 for 10 minutes)
   */
  getStickyProxyServer(sessionLifetime: number = 10): ProxyServer {
    const { host, port, username, password } = this.config;

    if (!username || !password) {
      logger.warn('Proxy credentials not configured');
      return { server: `http://${host}:${port}` };
    }

    // Generate session ID if not exists
    if (!this.sessionId) {
      this.sessionId = Math.random().toString(36).substring(2, 15);
    }

    const modifiedPassword = `${password}_session-${this.sessionId}_lifetime-${sessionLifetime}`;

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
   * Test proxy connectivity
   */
  async testProxy(): Promise<boolean> {
    try {
      const axios = require('axios');
      const proxyServer = this.getProxyServer();

    //   const response = await axios.get('https://ipv4.icanhazip.com/', {
    //     proxy: {
    //     //   protocol: 'http',
    //       host: this.config.host,
    //       port: this.config.port,
    //       auth: {
    //         username: this.config.username,
    //         password: this.config.password,
    //       },
    //     },
    //     timeout: 10000,
    //   });

        const username = this.config.username;
        const password = this.config.password;
        const host =  this.config.host;
        const port = this.config.port;


        // const { host, port, username, password } = this.config;
        const proxyUrl = `http://${username}:${password}@${host}:${port}`;
        const agent = new HttpsProxyAgent(proxyUrl);

        const res = await axios.get('http://ipv4.icanhazip.com', {
        httpAgent: agent,
        timeout: 10000,
        });

        console.log('Proxy test successful. IP:', res.data.trim());


        


      return true;
    } catch (error) {
      logger.error('Proxy test failed', { error: (error as Error).message });
      return false;
    }
  }
}
