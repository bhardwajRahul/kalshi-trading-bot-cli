export interface BacktestOpts {
  days: number;               // lookback period in days (default 30)
  resolvedOnly: boolean;
  unresolvedOnly: boolean;
  category?: string;
  minEdge: number;            // fractional (0-1 scale), converted to pp by caller (e.g., 0.005 → 0.5pp)
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
  pnl: number;               // computed P&L for this signal ($ per $1 face value)
  capital: number;           // $ capital deployed per $1 face value: kp/100 for YES edges, (100-kp)/100 for NO edges
  edge_bucket: string;        // absolute-edge bucket label e.g. "0-5%", "5-10%", ..., "90%+"
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
  flat_bet_roi: number;       // capital-weighted: sum(pnl) / sum(capital) across edge signals
  total_capital: number;      // sum of capital across edge signals (ROI denominator)
  signals: ScoredSignal[];
  /**
   * Count of candidate signals dropped because the Octagon snapshot had no
   * per-contract volume (older snapshots predate the per-contract field).
   * We deliberately do NOT fall back to Kalshi lifetime volume — that
   * would be a look-ahead bias (lifetime includes post-entry trading).
   * Surfaced so users can see the coverage cost of the strict gate.
   */
  signals_dropped_no_volume: number;
  /**
   * Zero-skill baseline ROIs on the same post-filter universe. Always-NO is
   * the relevant null because Kalshi's universe is structurally NO-heavy:
   * multi-outcome events have one YES and many NOs. A model that consistently
   * beats always-NO has selection skill; one that doesn't is mostly
   * harvesting the favorite-longshot tilt.
   */
  baselines: {
    always_no_roi: number;
    always_no_hit_rate: number;
    always_yes_roi: number;
    always_yes_hit_rate: number;
    /**
     * Model NO-bet ROI minus always-NO ROI, computed in entry-price bands
     * (5-20, 20-40, 40-60, 60-80, 80-95) and capital-weighted across bands.
     * This is the honest "within-band skill" delta: it controls for both
     * the structural NO tilt AND the entry-price mix.
     */
    within_band_skill_pp: number;
    /**
     * Per-band breakdown so users can see where the skill (if any) comes from.
     */
    within_band_breakdown: Array<{
      band: string;            // e.g. "20-40¢"
      model_no_roi: number;    // model NO-bet ROI in this band
      always_no_roi: number;   // always-NO ROI in this band
      skill_delta_pp: number;  // (model - baseline) × 100, percentage points
      n_model: number;         // count of model NO bets in this band
      n_universe: number;      // count of all-NO universe contracts in this band
    }>;
  };
  subscription_notice?: string;
}
