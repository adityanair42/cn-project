// =============================================================================
// UDP Simulator — Fire-and-forget, no reliability guarantees
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import {
  RUDPPacket,
  PacketEvent,
  FLAG_DATA,
  type ProtocolMode,
} from './types';
import { createPacketEvent } from './rudp-engine';

/**
 * UDP Simulator — minimal overhead:
 *  - No handshake
 *  - No ACK
 *  - No retransmission
 *  - No checksum verification (optional, can be toggled)
 *  - No ordering guarantees
 *  - Packets can be lost (decided by network simulator)
 */
export class UDPSimulator {
  private seqCounter: number = 0;

  /**
   * UDP just sends — no connection setup needed.
   * Returns the packet to transmit. 
   * The network simulator decides if it arrives.
   */
  sendData(
    sourceId: string,
    targetId: string,
    payload: string,
  ): RUDPPacket {
    this.seqCounter++;
    return {
      id: uuidv4().slice(0, 8),
      header: {
        flags: FLAG_DATA,
        seqNum: this.seqCounter,
        ackNum: 0,
        checksum: 0,       // UDP mode: no checksum
        payloadLen: payload.length,
        timestamp: Date.now(),
      },
      payload,
    };
  }

  /**
   * UDP receive — just accept, no ACK sent back.
   * Returns the received event.
   */
  receive(
    packet: RUDPPacket,
    sourceId: string,
    targetId: string,
  ): PacketEvent {
    return createPacketEvent(packet, sourceId, targetId, 'received', 'udp');
  }
}
