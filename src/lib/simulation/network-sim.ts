import type { SimulationConfig } from '../protocol/types';

export function simulateNetworkConditions(config: SimulationConfig): {
  delayMs: number;
  dropped: boolean;
} {
  const lossRoll = Math.random() * 100;
  if (lossRoll < config.packetLossPercent) {
    return { delayMs: 0, dropped: true };
  }

  const jitter = config.jitterMs > 0 ? (Math.random() * 2 - 1) * config.jitterMs : 0;
  const delayMs = Math.max(1, config.latencyMs + jitter);
  return { delayMs: Math.round(delayMs), dropped: false };
}
