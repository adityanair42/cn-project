// =============================================================================
// Network Simulator — Latency, jitter, and packet loss injection
// =============================================================================

import type { SimulationConfig } from '../protocol/types';

/**
 * Calculate the actual delivery delay for a packet, given network conditions.
 * Returns delay in ms, or -1 if the packet should be dropped.
 */
export function simulateNetworkConditions(config: SimulationConfig): {
  delayMs: number;
  dropped: boolean;
} {
  // Roll for packet loss
  const lossRoll = Math.random() * 100;
  if (lossRoll < config.packetLossPercent) {
    return { delayMs: 0, dropped: true };
  }

  // Calculate delay: base latency + random jitter
  const jitter = config.jitterMs > 0
    ? (Math.random() * 2 - 1) * config.jitterMs  // ±jitter
    : 0;
  const delayMs = Math.max(1, config.latencyMs + jitter);

  return { delayMs: Math.round(delayMs), dropped: false };
}

/**
 * Simulate latency for a specific link (if per-link config is set)
 */
export function simulateLinkConditions(
  baseLinkLatencyMs: number,
  baseLinkLossPercent: number,
  globalConfig: SimulationConfig,
): {
  delayMs: number;
  dropped: boolean;
} {
  // Combine link-specific and global loss rates
  const effectiveLoss = Math.min(100, baseLinkLossPercent + globalConfig.packetLossPercent);
  const lossRoll = Math.random() * 100;
  if (lossRoll < effectiveLoss) {
    return { delayMs: 0, dropped: true };
  }

  // Combine link-specific latency with global settings
  const baseDelay = baseLinkLatencyMs + globalConfig.latencyMs;
  const jitter = globalConfig.jitterMs > 0
    ? (Math.random() * 2 - 1) * globalConfig.jitterMs
    : 0;
  const delayMs = Math.max(1, baseDelay + jitter);

  return { delayMs: Math.round(delayMs), dropped: false };
}
