import { logger } from '../utils/logger.js';

/**
 * A single event entry from the Octagon Prediction Markets Events API.
 * Probabilities are percentages (0-100).
 */
export interface OctagonEventEntry {
  history_id: number;
  run_id: string;
  captured_at: string;
  event_ticker: string;
  name: string;
  slug: string;
  image_url?: string;
  series_category: string;
  available_on_brokers: boolean;
  mutually_exclusive: boolean;
  analysis_last_updated: string;
  confidence_score: number;
  model_probability: number;
  market_probability: number;
  edge_pp: number;
  expected_return: number;
  r_score: number;
  total_volume: number;
  total_open_interest: number;
  close_time: string;
  key_takeaway: string;
  current_state_summary_richtext?: string;
  short_answer_richtext?: string;
  executive_summary_richtext?: string;
}

interface EventsPage {
  data: OctagonEventEntry[];
  next_cursor: string | null;
  has_more: boolean;
}

const EVENTS_API_BASE = 'https://api.octagonai.co/v1';
const PAGE_LIMIT = 200;
const TIMEOUT_MS = 60_000;

/**
 * Fetch all events from the Octagon Prediction Markets Events API,
 * paginating through all pages.
 * @param opts.hasHistory - When true, only return events with multiple historical snapshots.
 */
export async function fetchAllOctagonEvents(opts?: { hasHistory?: boolean }): Promise<OctagonEventEntry[]> {
  const apiKey = process.env.OCTAGON_API_KEY;
  if (!apiKey) throw new Error('OCTAGON_API_KEY not set');

  const all: OctagonEventEntry[] = [];
  let cursor: string | null = null;
  let pageNum = 0;

  do {
    const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
    if (opts?.hasHistory) params.set('has_history', 'true');
    if (cursor) params.set('cursor', cursor);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let resp: Response;
    try {
      resp = await fetch(`${EVENTS_API_BASE}/prediction-markets/events?${params}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      throw new Error(`Octagon events API ${resp.status}: ${body.slice(0, 200)}`);
    }

    const page = (await resp.json()) as EventsPage;
    all.push(...page.data);
    cursor = page.has_more ? page.next_cursor : null;
    pageNum++;
    logger.info(`[octagon-prefetch] Page ${pageNum}: ${page.data.length} events (total ${all.length})`);
  } while (cursor);

  return all;
}
