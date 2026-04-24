/**
 * AdProfit — pure metric calculations (client / future server shared)
 *
 * Definitions (workspace defaults may refine fees later):
 * - ROAS     = revenue ÷ ad spend
 * - CPA      = ad spend ÷ purchases
 * - Net profit = revenue − ad spend − (product + shipping + fees)
 * - Margin   = net profit ÷ revenue
 *
 * @module metrics
 */

/**
 * @param {unknown} n
 * @returns {n is number}
 */
function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

/**
 * @param {number} value
 * @param {number} [decimals=2]
 */
export function roundTo(value, decimals = 2) {
  if (!isFiniteNumber(value)) return null;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * @param {{ product?: number, shipping?: number, fees?: number } | null | undefined} costs
 */
export function sumVariableCosts(costs) {
  if (!costs) return 0;
  const p = isFiniteNumber(costs.product) ? costs.product : 0;
  const s = isFiniteNumber(costs.shipping) ? costs.shipping : 0;
  const f = isFiniteNumber(costs.fees) ? costs.fees : 0;
  return p + s + f;
}

/**
 * @param {number} revenue
 * @param {number} spend
 * @returns {number | null} null when spend ≤ 0
 */
export function computeRoas(revenue, spend) {
  if (!isFiniteNumber(revenue) || !isFiniteNumber(spend) || spend <= 0) return null;
  return revenue / spend;
}

/**
 * @param {number} spend
 * @param {number} purchases
 * @returns {number | null} null when purchases ≤ 0
 */
export function computeCpa(spend, purchases) {
  if (!isFiniteNumber(spend) || !isFiniteNumber(purchases) || purchases <= 0) return null;
  return spend / purchases;
}

/**
 * Net profit after ad spend and attributable variable costs.
 * @param {number} revenue
 * @param {number} spend
 * @param {number} variableCostsTotal product + shipping + fees (and similar)
 */
export function computeNetProfit(revenue, spend, variableCostsTotal) {
  if (
    !isFiniteNumber(revenue) ||
    !isFiniteNumber(spend) ||
    !isFiniteNumber(variableCostsTotal)
  ) {
    return null;
  }
  return revenue - spend - variableCostsTotal;
}

/**
 * @param {number} profit
 * @param {number} revenue
 * @returns {number | null} null when revenue ≤ 0
 */
export function computeMargin(profit, revenue) {
  if (!isFiniteNumber(profit) || !isFiniteNumber(revenue) || revenue <= 0) return null;
  return profit / revenue;
}

/**
 * Campaign-shaped row from API or mock (`data.js`).
 * @typedef {object} CampaignLike
 * @property {number} spend
 * @property {number} purchases
 * @property {number} revenue
 * @property {{ product?: number, shipping?: number, fees?: number }} [costs]
 */

/**
 * Derived metrics for one campaign — use for tables and validation.
 * @param {CampaignLike} campaign
 */
export function deriveCampaignMetrics(campaign) {
  const variableCosts = sumVariableCosts(campaign.costs);
  const profit = computeNetProfit(campaign.revenue, campaign.spend, variableCosts);

  return {
    roas: computeRoas(campaign.revenue, campaign.spend),
    cpa: computeCpa(campaign.spend, campaign.purchases),
    profit,
    margin: profit == null ? null : computeMargin(profit, campaign.revenue),
    variableCosts,
  };
}

/**
 * Roll up a list of campaigns (same window / attribution rules).
 * Headline KPIs may still apply workspace adjustments on top of this.
 * @param {CampaignLike[]} campaigns
 */
export function aggregateCampaignRollup(campaigns) {
  if (!Array.isArray(campaigns) || campaigns.length === 0) {
    return {
      totalSpend: 0,
      totalRevenue: 0,
      totalPurchases: 0,
      totalVariableCosts: 0,
      blendedRoas: null,
      blendedCpa: null,
      estimatedNetProfit: null,
      margin: null,
    };
  }

  let totalSpend = 0;
  let totalRevenue = 0;
  let totalPurchases = 0;
  let totalVariableCosts = 0;

  for (const c of campaigns) {
    totalSpend += c.spend;
    totalRevenue += c.revenue;
    totalPurchases += c.purchases;
    totalVariableCosts += sumVariableCosts(c.costs);
  }

  const estimatedNetProfit = computeNetProfit(
    totalRevenue,
    totalSpend,
    totalVariableCosts
  );

  return {
    totalSpend,
    totalRevenue,
    totalPurchases,
    totalVariableCosts,
    blendedRoas: computeRoas(totalRevenue, totalSpend),
    blendedCpa: computeCpa(totalSpend, totalPurchases),
    estimatedNetProfit,
    margin:
      estimatedNetProfit == null
        ? null
        : computeMargin(estimatedNetProfit, totalRevenue),
  };
}

/**
 * Compare stored campaign metrics to freshly derived values (QA / sync checks).
 * @param {CampaignLike & { estimatedProfit?: number, roas?: number, cpa?: number }} campaign
 * @param {{ epsilonMoney?: number, epsilonRatio?: number }} [opts]
 */
export function diffCampaignAgainstDerived(campaign, opts = {}) {
  const epsilonMoney = opts.epsilonMoney ?? 0.5;
  const epsilonRatio = opts.epsilonRatio ?? 0.005;

  const d = deriveCampaignMetrics(campaign);
  const out = { roas: null, cpa: null, profit: null };

  if (campaign.roas != null && d.roas != null) {
    out.roas = Math.abs(campaign.roas - d.roas) > epsilonRatio;
  }
  if (campaign.cpa != null && d.cpa != null) {
    out.cpa = Math.abs(campaign.cpa - d.cpa) > epsilonRatio;
  }
  if (campaign.estimatedProfit != null && d.profit != null) {
    out.profit = Math.abs(campaign.estimatedProfit - d.profit) > epsilonMoney;
  }

  return { derived: d, drift: out };
}
