import { v4 as uuidv4 } from 'uuid';
import {
  RUDPPacket, RUDPHeader, PacketEvent,
  FLAG_SYN, FLAG_ACK, FLAG_DATA, FLAG_FIN, FLAG_NACK,
  TIMEOUT_MS, type ProtocolMode,
} from './types';
import { calculateChecksum, verifyChecksum } from './checksum';

function makePacketId(): string {
  return uuidv4().slice(0, 8);
}

function emptyHeader(): RUDPHeader {
  return { flags: 0, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() };
}

export function createSynPacket(sourceId: string, targetId: string): RUDPPacket {
  return { id: makePacketId(), header: { ...emptyHeader(), flags: FLAG_SYN }, payload: '' };
}

export function createSynAckPacket(): RUDPPacket {
  return { id: makePacketId(), header: { ...emptyHeader(), flags: FLAG_SYN | FLAG_ACK }, payload: '' };
}

export function createAckPacket(ackNum: number = 0): RUDPPacket {
  return { id: makePacketId(), header: { ...emptyHeader(), flags: FLAG_ACK, ackNum }, payload: '' };
}

export function createDataPacket(seqNum: number, payload: string): RUDPPacket {
  const payloadLen = payload.length;
  const checksum = calculateChecksum(payload, payloadLen);
  return {
    id: makePacketId(),
    header: { ...emptyHeader(), flags: FLAG_DATA, seqNum, payloadLen, checksum },
    payload,
  };
}

export function createFinPacket(): RUDPPacket {
  return { id: makePacketId(), header: { ...emptyHeader(), flags: FLAG_FIN }, payload: '' };
}

export function flagsToString(flags: number): string {
  const parts: string[] = [];
  if (flags & FLAG_SYN)  parts.push('SYN');
  if (flags & FLAG_ACK)  parts.push('ACK');
  if (flags & FLAG_DATA) parts.push('DATA');
  if (flags & FLAG_FIN)  parts.push('FIN');
  if (flags & FLAG_NACK) parts.push('NACK');
  return parts.join('+') || 'NONE';
}

export interface RUDPSession {
  connectionId: string;
  sourceNodeId: string;
  targetNodeId: string;
  state: 'CLOSED' | 'SYN_SENT' | 'SYN_RECEIVED' | 'ESTABLISHED' | 'FIN_WAIT' | 'CLOSE_WAIT';
  localSeqNum: number;
  expectedSeqNum: number;
  retransmitCount: number;
  maxRetransmits: number;
  timeoutMs: number;
  pendingPacket: RUDPPacket | null;
  rttSamples: number[];
  avgRtt: number;
}

export function createSession(sourceNodeId: string, targetNodeId: string): RUDPSession {
  return {
    connectionId: uuidv4(),
    sourceNodeId, targetNodeId,
    state: 'CLOSED',
    localSeqNum: 1,
    expectedSeqNum: 1,
    retransmitCount: 0,
    maxRetransmits: 5,
    timeoutMs: TIMEOUT_MS,
    pendingPacket: null,
    rttSamples: [],
    avgRtt: 0,
  };
}

export function createPacketEvent(
  packet: RUDPPacket, sourceNodeId: string, targetNodeId: string,
  direction: PacketEvent['direction'], protocol: ProtocolMode,
  latencyMs?: number, hopPath?: string[],
): PacketEvent {
  return {
    id: uuidv4(), timestamp: Date.now(), packetId: packet.id,
    sourceNodeId, targetNodeId,
    flags: packet.header.flags, seqNum: packet.header.seqNum, ackNum: packet.header.ackNum,
    checksum: packet.header.checksum, payloadLen: packet.header.payloadLen,
    payload: packet.payload, direction, protocol, latencyMs, hopPath,
  };
}

export function initiateHandshake(session: RUDPSession): { session: RUDPSession; packetToSend: RUDPPacket } {
  const synPacket = createSynPacket(session.sourceNodeId, session.targetNodeId);
  return { session: { ...session, state: 'SYN_SENT' }, packetToSend: synPacket };
}

export function handleReceivedPacket(session: RUDPSession, packet: RUDPPacket): {
  session: RUDPSession;
  responsePacket: RUDPPacket | null;
  event: 'handshake_syn' | 'handshake_ack' | 'data_ok' | 'data_checksum_fail' | 'data_duplicate' | 'ack_received' | 'syn_ack_received' | 'fin' | 'unknown';
} {
  const flags = packet.header.flags;

  if (flags === FLAG_SYN) {
    return { session: { ...session, state: 'SYN_RECEIVED' }, responsePacket: createSynAckPacket(), event: 'handshake_syn' };
  }

  if (flags === (FLAG_SYN | FLAG_ACK)) {
    return { session: { ...session, state: 'ESTABLISHED' }, responsePacket: createAckPacket(0), event: 'syn_ack_received' };
  }

  if (flags === FLAG_ACK) {
    if (session.state === 'SYN_RECEIVED') {
      return { session: { ...session, state: 'ESTABLISHED' }, responsePacket: null, event: 'handshake_ack' };
    }
    if (session.pendingPacket && packet.header.ackNum === session.localSeqNum - 1) {
      const rtt = Date.now() - session.pendingPacket.header.timestamp;
      const samples = [...session.rttSamples, rtt];
      return {
        session: { ...session, pendingPacket: null, retransmitCount: 0, rttSamples: samples, avgRtt: samples.reduce((a, b) => a + b, 0) / samples.length },
        responsePacket: null, event: 'ack_received',
      };
    }
    return { session, responsePacket: null, event: 'ack_received' };
  }

  if (flags & FLAG_DATA) {
    if (!verifyChecksum(packet.payload, packet.header.payloadLen, packet.header.checksum)) {
      return { session, responsePacket: null, event: 'data_checksum_fail' };
    }
    const isDuplicate = packet.header.seqNum < session.expectedSeqNum;
    return {
      session: { ...session, expectedSeqNum: isDuplicate ? session.expectedSeqNum : packet.header.seqNum + 1 },
      responsePacket: createAckPacket(packet.header.seqNum),
      event: isDuplicate ? 'data_duplicate' : 'data_ok',
    };
  }

  if (flags & FLAG_FIN) {
    return { session: { ...session, state: 'CLOSE_WAIT' }, responsePacket: createAckPacket(), event: 'fin' };
  }

  return { session, responsePacket: null, event: 'unknown' };
}

export function prepareDataSend(session: RUDPSession, payload: string): { session: RUDPSession; packet: RUDPPacket } {
  const packet = createDataPacket(session.localSeqNum, payload);
  return {
    session: { ...session, localSeqNum: session.localSeqNum + 1, pendingPacket: packet, retransmitCount: 0 },
    packet,
  };
}

export function handleTimeout(session: RUDPSession): { session: RUDPSession; retransmitPacket: RUDPPacket | null; giveUp: boolean } {
  if (!session.pendingPacket) return { session, retransmitPacket: null, giveUp: false };
  if (session.retransmitCount >= session.maxRetransmits) {
    return { session: { ...session, pendingPacket: null, retransmitCount: 0 }, retransmitPacket: null, giveUp: true };
  }
  const retransmit: RUDPPacket = {
    ...session.pendingPacket,
    id: makePacketId(),
    header: { ...session.pendingPacket.header, timestamp: Date.now() },
  };
  return { session: { ...session, retransmitCount: session.retransmitCount + 1 }, retransmitPacket: retransmit, giveUp: false };
}
