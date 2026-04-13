import type { Database } from 'bun:sqlite';
import type { OctagonEventEntry } from '../scan/octagon-events-api.js';
import { logger } from '../utils/logger.js';

interface HistoryPage {
  event_ticker: string;
  data: OctagonEventEntry[];
  next_cursor: string | null;
  has_more: boolean;
}

const EVENTS_API_BASE = 'https://api.octagonai.co/v1';
const PAGE_LIMIT = 200;
const TIMEOUT_MS = 60_000;

/**
 * Fetch all history snapshots for an event from the Octagon API.
 * Supports optional time window filtering via captured_from/captured_to.
 */
export async function fetchEventHistory(
  eventTicker: string,
  opts?: { capturedFrom?: string; capturedTo?: string },
): Promise<OctagonEventEntry[]> {
  const apiKey = process.env.OCTAGON_API_KEY;
  if (!apiKey) throw new Error('OCTAGON_API_KEY not set');

  const all: OctagonEventEntry[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (cursor) params.set('cursor', cursor);
    if (opts?.capturedFrom) params.set('captured_from', opts.capturedFrom);
    if (opts?.capturedTo) params.set('captured_to', opts.capturedTo);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(
        `${EVENTS_API_BASE}/prediction-markets/events/${encodeURIComponent(eventTicker)}/history?${params}`,
        { headers: { Authorization: `Bearer ${apiKey}` }, signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Octagon history API ${resp.status} for ${eventTicker}: ${body.slice(0, 200)}`);
    }

    const page = (await resp.json()) as HistoryPage;
    all.push(...page.data);
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);

  return all;
}

/**
 * Fetch event history and cache it in the local octagon_history table.
 * Returns cached data if already present and not expired.
 */
export async function fetchAndCacheHistory(
  db: Database,
  eventTicker: string,
  opts?: { capturedFrom?: string; capturedTo?: string },
): Promise<OctagonEventEntry[]> {
  // Check if we already have cached history for this event
  const cached = db.query(
    'SELECT COUNT(*) as cnt FROM octagon_history WHERE event_ticker = $et',
  ).get({ $et: eventTicker }) as { cnt: number };

  if (cached.cnt > 0) {
    // Return from cache
    const rows = db.query(
      `SELECT * FROM octagon_history WHERE event_ticker = $et ORDER BY captured_at ASC`,
    ).all({ $et: eventTicker }) as Array<{
      history_id: number;
      event_ticker: string;
      captured_at: string;
      model_probability: number;
      market_probability: number;
      edge_pp: number;
      confidence_score: number;
      series_category: string;
      close_time: string;
      name: string;
    }>;
    // Convert DB rows back to OctagonEventEntry shape (minimal fields needed)
    return rows.map(r => ({
      history_id: r.history_id,
      run_id: '',
      captured_at: r.captured_at,
      event_ticker: r.event_ticker,
      name: r.name ?? '',
      slug: '',
      series_category: r.series_category ?? '',
      available_on_brokers: true,
      mutually_exclusive: false,
      analysis_last_updated: r.captured_at,
      confidence_score: r.confidence_score,
      model_probability: r.model_probability,
      market_probability: r.market_probability,
      edge_pp: r.edge_pp ?? 0,
      expected_return: 0,
      r_score: 0,
      total_volume: 0,
      total_open_interest: 0,
      close_time: r.close_time ?? '',
      key_takeaway: '',
    }));
  }

  // Fetch from API
  const snapshots = await fetchEventHistory(eventTicker, opts);

  // Cache in DB
  const insert = db.prepare(`
    INSERT OR IGNORE INTO octagon_history
      (history_id, event_ticker, captured_at, model_probability, market_probability,
       edge_pp, confidence_score, series_category, close_time, name)
    VALUES ($history_id, $event_ticker, $captured_at, $model_probability, $market_probability,
            $edge_pp, $confidence_score, $series_category, $close_time, $name)
  `);

  db.transaction(() => {
    for (const s of snapshots) {
      insert.run({
        $history_id: s.history_id,
        $event_ticker: s.event_ticker,
        $captured_at: s.captured_at,
        $model_probability: s.model_probability,
        $market_probability: s.market_probability,
        $edge_pp: s.edge_pp,
        $confidence_score: s.confidence_score,
        $series_category: s.series_category ?? '',
        $close_time: s.close_time ?? '',
        $name: s.name ?? '',
      });
    }
  })();

  logger.info(`[backtest] Cached ${snapshots.length} history snapshots for ${eventTicker}`);
  return snapshots;
}

/**
 * Select the appropriate snapshot for backtesting a resolved market.
 * Returns the last snapshot captured >= minHours before market close.
 * Probabilities in the returned snapshot are percentages (0-100).
 */
export function selectSnapshot(
  snapshots: OctagonEventEntry[],
  closeTime: string,
  minHoursBeforeClose: number,
): OctagonEventEntry | null {
  const closeEpoch = new Date(closeTime).getTime();
  const cutoff = closeEpoch - minHoursBeforeClose * 3600 * 1000;

  // Find the last snapshot before the cutoff
  let best: OctagonEventEntry | null = null;
  for (const s of snapshots) {
    const capturedEpoch = new Date(s.captured_at).getTime();
    if (capturedEpoch <= cutoff) {
      if (!best || capturedEpoch > new Date(best.captured_at).getTime()) {
        best = s;
      }
    }
  }
  return best;
}
