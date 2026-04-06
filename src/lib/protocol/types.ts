export const MAX_PAYLOAD = 1024;
export const TIMEOUT_MS = 2000;

export const FLAG_SYN  = 0x01;
export const FLAG_ACK  = 0x02;
export const FLAG_DATA = 0x04;
export const FLAG_FIN  = 0x08;
export const FLAG_NACK = 0x10;

export type ProtocolMode = 'rudp' | 'tcp' | 'udp' | 'adaptive';

export interface RUDPHeader {
  flags: number;
  seqNum: number;
  ackNum: number;
  checksum: number;
  payloadLen: number;
  timestamp: number;
}

export interface RUDPPacket {
  id: string;
  header: RUDPHeader;
  payload: string;
}

export type ConnectionState =
  | 'CLOSED'
  | 'SYN_SENT'
  | 'SYN_RECEIVED'
  | 'ESTABLISHED'
  | 'FIN_WAIT'
  | 'CLOSE_WAIT';

export interface Connection {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  state: ConnectionState;
  localSeqNum: number;
  remoteSeqNum: number;
  protocol: ProtocolMode;
  createdAt: number;
}

export interface PacketEvent {
  id: string;
  timestamp: number;
  packetId: string;
  sourceNodeId: string;
  targetNodeId: string;
  flags: number;
  seqNum: number;
  ackNum: number;
  checksum: number;
  payloadLen: number;
  payload: string;
  direction: 'sent' | 'received' | 'dropped' | 'retransmit';
  protocol: ProtocolMode;
  latencyMs?: number;
  hop?: number;
  hopPath?: string[];
}

export interface NodeMetrics {
  nodeId: string;
  packetsSent: number;
  packetsReceived: number;
  packetsDropped: number;
  packetsRetransmitted: number;
  bytesTransferred: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  throughputBps: number;
  checksumFailures: number;
}

export interface SimulationConfig {
  latencyMs: number;
  jitterMs: number;
  packetLossPercent: number;
  autoSendInterval: number;
  autoPayloadSize: number;
}

export interface SimNode {
  id: string;
  label: string;
  x: number;
  y: number;
  type: 'endpoint' | 'router';
  metrics: NodeMetrics;
}

export interface SimLink {
  id: string;
  source: string;
  target: string;
  latencyMs: number;
  packetLossPercent: number;
}

export interface SimulationState {
  nodes: SimNode[];
  links: SimLink[];
  connections: Connection[];
  packetLog: PacketEvent[];
  config: SimulationConfig;
  isRunning: boolean;
  activeProtocol: ProtocolMode;
}
