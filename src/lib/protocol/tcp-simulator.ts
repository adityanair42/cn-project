// =============================================================================
// TCP Simulator — Simulates full TCP-like reliable delivery
// =============================================================================

import {
  RUDPPacket,
  PacketEvent,
  FLAG_SYN,
  FLAG_ACK,
  FLAG_DATA,
  FLAG_FIN,
  type ProtocolMode,
} from './types';
import {
  createSynPacket,
  createSynAckPacket,
  createAckPacket,
  createDataPacket,
  createFinPacket,
  createPacketEvent,
  flagsToString,
  type RUDPSession,
  createSession,
  handleReceivedPacket,
  prepareDataSend,
  handleTimeout,
  initiateHandshake,
} from './rudp-engine';

/**
 * TCP Simulator — always does full reliability:
 *  - 3-way handshake (always)
 *  - Checksum on every packet
 *  - ACK on every packet
 *  - Retransmit on timeout
 *  - Ordered delivery
 * 
 * Essentially runs the RUDP engine at max reliability.
 */
export class TCPSimulator {
  private sessions: Map<string, RUDPSession> = new Map();

  createConnection(sourceId: string, targetId: string): RUDPSession {
    const session = createSession(sourceId, targetId);
    this.sessions.set(session.connectionId, session);
    return session;
  }

  getSession(connId: string): RUDPSession | undefined {
    return this.sessions.get(connId);
  }

  /**
   * TCP always performs handshake
   */
  startHandshake(connId: string): { session: RUDPSession; packet: RUDPPacket } | null {
    const session = this.sessions.get(connId);
    if (!session) return null;
    const result = initiateHandshake(session);
    this.sessions.set(connId, result.session);
    return { session: result.session, packet: result.packetToSend };
  }

  /**
   * TCP always sends with full reliability
   */
  sendData(connId: string, payload: string): { session: RUDPSession; packet: RUDPPacket } | null {
    const session = this.sessions.get(connId);
    if (!session || session.state !== 'ESTABLISHED') return null;
    const result = prepareDataSend(session, payload);
    this.sessions.set(connId, result.session);
    return { session: result.session, packet: result.packet };
  }

  /**
   * Process received packet with full TCP semantics
   */
  receive(connId: string, packet: RUDPPacket) {
    const session = this.sessions.get(connId);
    if (!session) return null;
    const result = handleReceivedPacket(session, packet);
    this.sessions.set(connId, result.session);
    return result;
  }

  /**
   * TCP retransmits on timeout
   */
  onTimeout(connId: string) {
    const session = this.sessions.get(connId);
    if (!session) return null;
    const result = handleTimeout(session);
    this.sessions.set(connId, result.session);
    return result;
  }
}
