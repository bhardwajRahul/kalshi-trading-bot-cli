export interface BacktestOpts {
  days: number;               // lookback period in days (default 30)
  resolvedOnly: boolean;
  unresolvedOnly: boolean;
  category?: string;
  minEdge: number;            // 0-1 scale (e.g., 0.05 = 5pp)
  exportPath?: string;
}

/** A single scored market signal — unified type for both resolved and unresolved. */
export interface ScoredSignal {
  event_ticker: string;
  market_ticker: string;
  series_category: string;
  model_prob: number;         // 0-100 (Octagon model % from N days ago)
  market_then: number;        // 0-100 (Kalshi trading price N days ago, from Octagon snapshot)
  market_now: number;         // 0-100 (settlement for resolved, current price for unresolved)
  resolved: boolean;
  edge_pp: number;            // model_prob - market_then
  pnl: number;               // computed P&L for this signal
  confidence_score: number;
  close_time: string;
}

export interface BacktestResult {
  verdict: { summary: string; significant: boolean; profitable: boolean };
  days: number;
  events_scored: number;
  markets_resolved: number;
  markets_unresolved: number;
  brier_octagon: number;
  brier_market: number;
  skill_score: number;
  skill_ci: [number, number];
  edge_signals: number;
  edge_hit_rate: number;
  hit_rate_ci: [number, number];
  flat_bet_pnl: number;
  flat_bet_roi: number;
  signals: ScoredSignal[];
  subscription_notice?: string;
}
