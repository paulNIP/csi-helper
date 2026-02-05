import axios, { AxiosInstance } from 'axios';
import logger from './logger';
import { randomInt, generateSessionId, getRandomUserAgent } from './utils';
import { ProxyManager } from './proxy-manager';

export interface UsabillaPayload {
  id: string | null;
  sig: string | null;
  type: string;
  subtype: string;
  v: number;
  data: {
    data: {
      mood?: string;
      SAT_MatrixRating?: {
        SAT_Ergonomics?: string;
        SAT_Vehicle_Characteristics?: string;
        SAT_Vehicle_Price?: string;
      };
      DIFF_FindInfo?: string[];
      Net_Easy_Score?: string;
      USER_VEHICLE?: string;
      GOAL_Visit?: string;
    };
    timing: {
      Satisfaction?: number;
      'Sub-Satisfaction'?: number;
      Efficiency?: number;
      Goal_Suggestions?: number;
    };
    url: string;
    customData: {};
    browser: string;
    id: string;
    version: number;
  };
  done: boolean;
}

export interface UsabillaResponse {
  id: string;
  sig: string;
}

export class UsabillaClient {
  private axiosInstance: AxiosInstance;
  private proxyManager: ProxyManager;
  private campaignId = 'a5f669c28be1979ab5e2785121a6e10b';
  private apiUrl = 'https://w.usabilla.com/incoming';
  private sessionId: string;
  private currentId: string | null = null;
  private currentSig: string | null = null;

  constructor(proxyManager: ProxyManager) {
    this.proxyManager = proxyManager;
    this.sessionId = generateSessionId();

    const proxyServer = this.proxyManager.getProxyServer();
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
      },
      proxy: proxyServer.server ? {
        protocol: 'http',
        host: proxyServer.server.split('://')[1].split(':')[0],
        port: parseInt(proxyServer.server.split(':')[2], 10),
        auth: proxyServer.username && proxyServer.password ? {
          username: proxyServer.username,
          password: proxyServer.password,
        } : undefined,
      } : false,
    });
  }

  /**
   * Submit page 1 (Overall Satisfaction)
   */
  async submitPage1(url: string, mood: string): Promise<UsabillaResponse> {
    const payload: UsabillaPayload = {
      id: this.currentId,
      sig: this.currentSig,
      type: 'campaign',
      subtype: 'form',
      v: 1,
      data: {
        data: { mood },
        timing: { Satisfaction: randomInt(5000, 45000) },
        url,
        customData: {},
        browser: getRandomUserAgent(),
        id: this.sessionId,
        version: 9,
      },
      done: false,
    };

    return this.submit(payload);
  }

  /**
   * Submit page 2 (Sub-Satisfaction Matrix)
   */
  async submitPage2(url: string, ratings: {
    SAT_Ergonomics: string;
    SAT_Vehicle_Characteristics: string;
    SAT_Vehicle_Price: string;
  }): Promise<UsabillaResponse> {
    const payload: UsabillaPayload = {
      id: this.currentId,
      sig: this.currentSig,
      type: 'campaign',
      subtype: 'form',
      v: 2,
      data: {
        data: { SAT_MatrixRating: ratings },
        timing: { 'Sub-Satisfaction': randomInt(5000, 45000) },
        url,
        customData: {},
        browser: getRandomUserAgent(),
        id: this.sessionId,
        version: 9,
      },
      done: false,
    };

    return this.submit(payload);
  }

  /**
   * Submit page 3 (Efficiency)
   */
  async submitPage3(url: string, netEasyScore: string): Promise<UsabillaResponse> {
    const payload: UsabillaPayload = {
      id: this.currentId,
      sig: this.currentSig,
      type: 'campaign',
      subtype: 'form',
      v: 3,
      data: {
        data: {
          DIFF_FindInfo: [],
          Net_Easy_Score: netEasyScore,
        },
        timing: { Efficiency: randomInt(5000, 45000) },
        url,
        customData: {},
        browser: getRandomUserAgent(),
        id: this.sessionId,
        version: 9,
      },
      done: false,
    };

    return this.submit(payload);
  }

  /**
   * Submit page 4 (Goal & Vehicle Type) - Final submission
   */
  async submitPage4(url: string, userVehicle: string, goalVisit: string): Promise<UsabillaResponse> {
    const payload: UsabillaPayload = {
      id: this.currentId,
      sig: this.currentSig,
      type: 'campaign',
      subtype: 'form',
      v: 4,
      data: {
        data: {
          USER_VEHICLE: userVehicle,
          GOAL_Visit: goalVisit,
        },
        timing: { Goal_Suggestions: randomInt(5000, 45000) },
        url,
        customData: {},
        browser: getRandomUserAgent(),
        id: this.sessionId,
        version: 9,
      },
      done: true,
    };

    return this.submit(payload);
  }

  /**
   * Submit payload to Usabilla API
   */
  private async submit(payload: UsabillaPayload): Promise<UsabillaResponse> {
    try {
      logger.info(`Submitting Usabilla payload (v=${payload.v})`, {
        sessionId: this.sessionId,
        url: payload.data.url,
      });

      const response = await this.axiosInstance.post<UsabillaResponse>(this.apiUrl, payload);

      if (response.data.id && response.data.sig) {
        this.currentId = response.data.id;
        this.currentSig = response.data.sig;
        logger.info(`Usabilla response received (v=${payload.v})`, {
          id: response.data.id,
          sig: response.data.sig,
        });
        return response.data;
      }

      throw new Error('Invalid response from Usabilla API');
    } catch (error) {
      logger.error('Failed to submit to Usabilla API', {
        error: (error as Error).message,
        version: payload.v,
      });
      throw error;
    }
  }

  /**
   * Reset session
   */
  resetSession(): void {
    this.currentId = null;
    this.currentSig = null;
    this.sessionId = generateSessionId();
  }
}
