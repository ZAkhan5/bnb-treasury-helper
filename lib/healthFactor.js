export const RISK_LEVELS = Object.freeze(['SAFE', 'WARNING', 'DANGER', 'UNKNOWN']);

export function classifyHealthFactor(healthFactor, options = {}) {
  const warningThreshold = Number(options.warningThreshold ?? 1.5);
  const dangerThreshold = Number(options.dangerThreshold ?? 1.2);
  const value = typeof healthFactor === 'number' || typeof healthFactor === 'string'
    ? Number(healthFactor)
    : Number.NaN;

  if (!Number.isFinite(value) || value < 0
    || !Number.isFinite(warningThreshold)
    || !Number.isFinite(dangerThreshold)
    || dangerThreshold >= warningThreshold) {
    return 'UNKNOWN';
  }
  if (value < dangerThreshold) return 'DANGER';
  if (value < warningThreshold) return 'WARNING';
  return 'SAFE';
}

export function healthFactorExplanation(riskLevel, healthFactor) {
  if (riskLevel === 'UNKNOWN') {
    return 'Health factor could not be reliably evaluated; no liquidation-risk conclusion is available.';
  }
  if (riskLevel === 'DANGER') {
    return `The reported health factor (${healthFactor}) is below the danger threshold; review the position promptly.`;
  }
  if (riskLevel === 'WARNING') {
    return `The reported health factor (${healthFactor}) is below the safe threshold; monitor the position closely.`;
  }
  return `The reported health factor (${healthFactor}) is at or above the configured safe threshold; this is not a guarantee against liquidation.`;
}

export function getRiskThresholds(env = process.env) {
  const warningThreshold = Number(env.HEALTH_FACTOR_WARNING ?? 1.5);
  const dangerThreshold = Number(env.HEALTH_FACTOR_DANGER ?? 1.2);
  if (!Number.isFinite(warningThreshold) || !Number.isFinite(dangerThreshold)
    || dangerThreshold < 0 || dangerThreshold >= warningThreshold) {
    const error = new Error('Health-factor thresholds must be finite, non-negative, and danger must be below warning.');
    error.code = 'INVALID_CONFIGURATION';
    throw error;
  }
  return { warningThreshold, dangerThreshold };
}