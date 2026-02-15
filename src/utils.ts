import crypto from 'crypto';

export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomChoice<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

export function weightedRandom(values: string[], weights: number[]): string {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < values.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return values[i];
    }
  }

  return values[values.length - 1];
}

export function generateSessionId(): string {
  return crypto.randomBytes(6).toString('hex');
}

export function generateRandomUuid(): string {
  return 'xxxxxxxxxxxxxxxxxxxxxxxx'.replace(/x/g, () => {
    const r = (Math.random() * 16) | 0;
    return r.toString(16);
  });
}

export function getRandomUserAgent(): string {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  ];
  return randomChoice(userAgents);
}

export function getRandomViewport(): { width: number; height: number } {
  const viewports = [
    { width: 1280, height: 720 },
    { width: 1366, height: 768 },
    { width: 1920, height: 1080 },
    { width: 1024, height: 768 },
  ];
  return randomChoice(viewports);
}

export interface ScheduleEntry {
  url: string;
  hour: number;
  minute: number;
}

export function generateDailySchedule(urls: string[], runsPerDay: number): ScheduleEntry[] {
  const windows: { start: number; end: number }[] = [];

  if (runsPerDay >= 3) {
    windows.push({ start: 8, end: 11 });
    windows.push({ start: 12, end: 15 });
    windows.push({ start: 17, end: 21 });
  } else if (runsPerDay === 2) {
    windows.push({ start: 9, end: 14 });
    windows.push({ start: 15, end: 20 });
  } else {
    windows.push({ start: 8, end: 20 });
  }

  return urls.flatMap((url) =>
    windows.slice(0, runsPerDay).map((window) => ({
      url,
      hour: randomInt(window.start, window.end),
      minute: randomInt(0, 59),
    }))
  );
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
