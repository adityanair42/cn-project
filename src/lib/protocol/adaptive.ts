// =============================================================================
// Adaptive Protocol — decides behavior based on payload & conditions
// =============================================================================

import type { ProtocolMode, SimulationConfig } from './types';

export interface AdaptiveDecision {
  effectiveMode: 'udp' | 'rudp-lite' | 'tcp';
  useHandshake: boolean;
  useChecksum: boolean;
  ackFrequency: 'none' | 'every-n' | 'every-packet';
  ackN: number;                  // ACK every N packets (if ackFrequency = 'every-n')
  useRetransmission: boolean;
  reason: string;
}

/**
 * Decide protocol behavior based on payload size and network conditions.
 * 
 * | Payload Size   | Behavior                                          | Similar To |
 * |----------------|---------------------------------------------------|------------|
 * | ≤ 64 bytes     | No handshake, no ACK, no checksum, fire-and-forget | UDP        |
 * | 65–512 bytes   | Checksum yes, ACK every 4th packet, no handshake   | RUDP-lite  |
 * | > 512 bytes    | Full: 3-way handshake, per-packet ACK, checksum    | TCP-like   |
 */
export function decideAdaptiveMode(
  payloadSize: number,
  config: SimulationConfig,
): AdaptiveDecision {
  // High loss environment → always go reliable
  if (config.packetLossPercent > 20) {
    return {
      effectiveMode: 'tcp',
      useHandshake: true,
      useChecksum: true,
      ackFrequency: 'every-packet',
      ackN: 1,
      useRetransmission: true,
      reason: `High packet loss (${config.packetLossPercent}%) → full reliability`,
    };
  }

  // Small payload → UDP-like
  if (payloadSize <= 64) {
    return {
      effectiveMode: 'udp',
      useHandshake: false,
      useChecksum: false,
      ackFrequency: 'none',
      ackN: 0,
      useRetransmission: false,
      reason: `Small payload (${payloadSize}B ≤ 64B) → fire-and-forget`,
    };
  }

  // Medium payload → RUDP-lite
  if (payloadSize <= 512) {
    return {
      effectiveMode: 'rudp-lite',
      useHandshake: false,
      useChecksum: true,
      ackFrequency: 'every-n',
      ackN: 4,
      useRetransmission: true,
      reason: `Medium payload (${payloadSize}B, 65-512B) → lightweight reliability`,
    };
  }

  // Large payload → full TCP-like
  return {
    effectiveMode: 'tcp',
    useHandshake: true,
    useChecksum: true,
    ackFrequency: 'every-packet',
    ackN: 1,
    useRetransmission: true,
    reason: `Large payload (${payloadSize}B > 512B) → full reliability`,
  };
}
