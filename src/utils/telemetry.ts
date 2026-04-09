import { StatsigClient } from '@statsig/js-client';
import { loadConfig, saveConfig } from './config.js';

const CLIENT_KEY = 'client-TbH2tfgwg2CYu87Y932Wj2CdNTfyy7303HFszn0YZny';

let client: StatsigClient | null = null;
let disabled = false;

function isEnabled(): boolean {
  const val = process.env.TELEMETRY_ENABLED;
  if (val === 'false' || val === '0') return false;
  return true;
}

function getOrCreateAnonymousId(): string {
  const config = loadConfig();
  if (config.anonymousId) return config.anonymousId;
  const id = crypto.randomUUID();
  saveConfig({ ...config, anonymousId: id });
  return id;
}

export async function initTelemetry(): Promise<void> {
  if (disabled || client) return;
  if (!isEnabled()) {
    disabled = true;
    return;
  }

  try {
    const userId = getOrCreateAnonymousId();
    const statsig = new StatsigClient(CLIENT_KEY, { userID: userId });
    await statsig.initializeAsync();
    client = statsig;

    // Flush on process exit
    const flush = () => {
      try { client?.flush(); } catch {}
    };
    process.on('beforeExit', flush);
    process.on('SIGINT', flush);
    process.on('SIGTERM', flush);
  } catch {
    disabled = true;
  }
}

export function trackEvent(
  name: string,
  metadata?: Record<string, string | number | boolean>,
): void {
  if (!client || disabled) return;
  try {
    client.logEvent(name, undefined, metadata as Record<string, string>);
  } catch {}
}

export async function shutdownTelemetry(): Promise<void> {
  if (!client || disabled) return;
  try {
    await Promise.race([
      client.flush(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    client.shutdown();
  } catch {}
  client = null;
}
