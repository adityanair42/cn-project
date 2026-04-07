import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  SimNode, SimLink, PacketEvent, SimulationConfig, ProtocolMode, NodeMetrics, RUDPPacket,
} from '../lib/protocol/types';
import { FLAG_SYN, FLAG_ACK, FLAG_DATA } from '../lib/protocol/types';
import { createPacketEvent, createDataPacket, type RUDPSession } from '../lib/protocol/rudp-engine';
import { simulateNetworkConditions } from '../lib/simulation/network-sim';
import { createNode, createLink, findPath } from '../lib/simulation/topology';

interface AnimatedPacket {
  id: string; sourceNodeId: string; targetNodeId: string; flags: number;
  progress: number; startTime: number; duration: number; protocol: ProtocolMode;
}

interface SimulatorStore {
  nodes: SimNode[]; links: SimLink[]; selectedNodeId: string | null; selectedLinkId: string | null;
  activeProtocol: ProtocolMode; sessions: Map<string, RUDPSession>;
  config: SimulationConfig; isRunning: boolean; autoSendTimerId: ReturnType<typeof setInterval> | null;
  packetLog: PacketEvent[]; animatedPackets: AnimatedPacket[];
  showSettings: boolean; showNodeConfig: string | null; inspectorTab: 'packets' | 'telemetry' | 'logs';
  logs: Array<{ id: string; timestamp: number; level: 'info' | 'warn' | 'error' | 'success'; message: string }>;
  theme: 'dark' | 'light';
  _epoch: number;

  addNode: (x: number, y: number, type?: SimNode['type']) => SimNode;
  removeNode: (id: string) => void;
  addLink: (sourceId: string, targetId: string) => void;
  removeLink: (id: string) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  selectNode: (id: string | null) => void;
  selectLink: (id: string | null) => void;
  setProtocol: (mode: ProtocolMode) => void;
  sendData: (sourceId: string, targetId: string, payload: string) => void;
  updateConfig: (partial: Partial<SimulationConfig>) => void;
  startAutoSend: () => void; stopAutoSend: () => void;
  clearLogs: () => void; clearPacketLog: () => void; resetSimulation: () => void;
  toggleSettings: () => void; setInspectorTab: (tab: SimulatorStore['inspectorTab']) => void;
  toggleTheme: () => void; setShowNodeConfig: (id: string | null) => void;
  addAnimatedPacket: (pkt: AnimatedPacket) => void;
  removeAnimatedPacket: (id: string) => void;
  _addLog: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void;
  _addPacketEvent: (event: PacketEvent) => void;
  _updateNodeMetrics: (nodeId: string, update: Partial<NodeMetrics>) => void;
  _incrementMetric: (nodeId: string, field: keyof NodeMetrics, amount?: number) => void;
}

const defaultConfig: SimulationConfig = {
  latencyMs: 30, jitterMs: 10, packetLossPercent: 0,
  autoSendInterval: 500, autoPayloadSize: 2048,
};

const HEADER_BYTES = 32;
const ANIM_MS = 600;
const ACK_ANIM_MS = 400;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateRandomPayload(size: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < size; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

let tcpCongestionPenalty = 0;

function lbl(nodes: SimNode[], id: string): string {
  return nodes.find(n => n.id === id)?.label || id.slice(0, 6);
}

export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  nodes: [], links: [], selectedNodeId: null, selectedLinkId: null,
  activeProtocol: 'rudp', sessions: new Map(), config: defaultConfig,
  isRunning: false, autoSendTimerId: null,
  packetLog: [], animatedPackets: [],
  showSettings: false, showNodeConfig: null, inspectorTab: 'packets', logs: [], theme: 'dark',
  _epoch: 0,

  addNode: (x, y, type = 'endpoint') => {
    const node = createNode(x, y, type);
    set((s) => ({ nodes: [...s.nodes, node] }));
    get()._addLog('info', `Node ${node.label} added`);
    return node;
  },
  removeNode: (id) => {
    const label = lbl(get().nodes, id);
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      links: s.links.filter((l) => l.source !== id && l.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
    get()._addLog('warn', `Node ${label} removed`);
  },
  addLink: (sourceId, targetId) => {
    const existing = get().links.find((l) => (l.source === sourceId && l.target === targetId) || (l.source === targetId && l.target === sourceId));
    if (existing) return;
    set((s) => ({ links: [...s.links, createLink(sourceId, targetId)] }));
    get()._addLog('info', `Link ${lbl(get().nodes, sourceId)} ↔ ${lbl(get().nodes, targetId)}`);
  },
  removeLink: (id) => {
    set((s) => ({ links: s.links.filter((l) => l.id !== id) }));
  },
  updateNodePosition: (id, x, y) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) })),
  selectNode: (id) => set({ selectedNodeId: id, selectedLinkId: null }),
  selectLink: (id) => set({ selectedLinkId: id, selectedNodeId: null }),
  setProtocol: (mode) => {
    set({ activeProtocol: mode });
    get()._addLog('info', `Protocol → ${mode.toUpperCase()}`);
  },

  sendData: (sourceId, targetId, payload) => {
    const state = get();
    const protocol = state.activeProtocol;
    const srcLabel = lbl(state.nodes, sourceId);
    const tgtLabel = lbl(state.nodes, targetId);
    const path = findPath(state.nodes, state.links, sourceId, targetId);
    if (!path) {
      get()._addLog('error', `NO ROUTE: ${srcLabel} → ${tgtLabel}`);
      return;
    }

    get()._addLog('info', `${protocol.toUpperCase()} ${srcLabel} → ${tgtLabel} [${payload.length}B, ${path.length - 1} hop${path.length > 2 ? 's' : ''}]`);
    const epoch = state._epoch;
    const cancelled = () => get()._epoch !== epoch;

    const animateHop = async (from: string, to: string, flags: number, dur: number): Promise<boolean> => {
      if (cancelled()) return false;
      const animId = uuidv4().slice(0, 8);
      get().addAnimatedPacket({ id: animId, sourceNodeId: from, targetNodeId: to, flags, progress: 0, startTime: Date.now(), duration: dur, protocol });
      await delay(dur);
      get().removeAnimatedPacket(animId);
      return !cancelled();
    };

    const simulateTransfer = async () => {
      if (protocol === 'tcp') {
        if (tcpCongestionPenalty > 500) {
          // Socket buffer blocked: severe congestion control kicks in
          get()._addLog('error', `TCP Congestion Window Collapsed (${tcpCongestionPenalty}ms penalty). Transmission rejected at source.`);
          // Decay the penalty slowly based on time passed so it eventually recovers
          tcpCongestionPenalty = Math.max(0, tcpCongestionPenalty - 200);
          return;
        }

        get()._addLog('info', `TCP handshake: ${srcLabel} → ${tgtLabel}`);

        if (tcpCongestionPenalty > 0) {
          get()._addLog('warn', `TCP queue delay: +${tcpCongestionPenalty}ms`);
          await delay(tcpCongestionPenalty);
          tcpCongestionPenalty = Math.max(0, tcpCongestionPenalty - 100);
        }

        get()._incrementMetric(sourceId, 'packetsSent');
        get()._incrementMetric(sourceId, 'bytesTransferred', HEADER_BYTES);
        const synPkt: RUDPPacket = { id: uuidv4().slice(0, 8), header: { flags: FLAG_SYN, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() }, payload: '' };
        get()._addPacketEvent(createPacketEvent(synPkt, sourceId, targetId, 'sent', 'tcp'));
        for (let i = 0; i < path.length - 1; i++) {
          if (!(await animateHop(path[i], path[i + 1], FLAG_SYN, ANIM_MS * 0.6))) return;
        }
        get()._incrementMetric(targetId, 'packetsReceived');
        get()._incrementMetric(targetId, 'bytesTransferred', HEADER_BYTES);
        get()._addLog('info', `SYN arrived at ${tgtLabel}`);

        get()._incrementMetric(targetId, 'packetsSent');
        get()._incrementMetric(targetId, 'bytesTransferred', HEADER_BYTES);
        const synAckPkt: RUDPPacket = { id: uuidv4().slice(0, 8), header: { flags: FLAG_SYN | FLAG_ACK, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() }, payload: '' };
        get()._addPacketEvent(createPacketEvent(synAckPkt, targetId, sourceId, 'sent', 'tcp'));
        const rev = [...path].reverse();
        for (let i = 0; i < rev.length - 1; i++) {
          if (!(await animateHop(rev[i], rev[i + 1], FLAG_SYN | FLAG_ACK, ANIM_MS * 0.6))) return;
        }
        get()._incrementMetric(sourceId, 'packetsReceived');
        get()._incrementMetric(sourceId, 'bytesTransferred', HEADER_BYTES);
        get()._addLog('info', `SYN-ACK arrived at ${srcLabel}`);

        get()._incrementMetric(sourceId, 'packetsSent');
        get()._incrementMetric(sourceId, 'bytesTransferred', HEADER_BYTES);
        const ackPkt: RUDPPacket = { id: uuidv4().slice(0, 8), header: { flags: FLAG_ACK, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() }, payload: '' };
        get()._addPacketEvent(createPacketEvent(ackPkt, sourceId, targetId, 'sent', 'tcp'));
        for (let i = 0; i < path.length - 1; i++) {
          if (!(await animateHop(path[i], path[i + 1], FLAG_ACK, ANIM_MS * 0.6))) return;
        }
        get()._incrementMetric(targetId, 'packetsReceived');
        get()._incrementMetric(targetId, 'bytesTransferred', HEADER_BYTES);
        get()._addLog('success', `TCP connection established ${srcLabel} ↔ ${tgtLabel}`);
      }

      if (protocol === 'rudp') {
        get()._addLog('info', `RUDP handshake: ${srcLabel} → ${tgtLabel}`);

        get()._incrementMetric(sourceId, 'packetsSent');
        get()._incrementMetric(sourceId, 'bytesTransferred', HEADER_BYTES);
        const synPkt: RUDPPacket = { id: uuidv4().slice(0, 8), header: { flags: FLAG_SYN, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() }, payload: '' };
        get()._addPacketEvent(createPacketEvent(synPkt, sourceId, targetId, 'sent', 'rudp'));
        for (let i = 0; i < path.length - 1; i++) {
          if (!(await animateHop(path[i], path[i + 1], FLAG_SYN, ANIM_MS * 0.5))) return;
        }
        get()._incrementMetric(targetId, 'packetsReceived');
        get()._incrementMetric(targetId, 'bytesTransferred', HEADER_BYTES);

        get()._incrementMetric(targetId, 'packetsSent');
        get()._incrementMetric(targetId, 'bytesTransferred', HEADER_BYTES);
        const synAckPkt: RUDPPacket = { id: uuidv4().slice(0, 8), header: { flags: FLAG_SYN | FLAG_ACK, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() }, payload: '' };
        get()._addPacketEvent(createPacketEvent(synAckPkt, targetId, sourceId, 'sent', 'rudp'));
        const rev = [...path].reverse();
        for (let i = 0; i < rev.length - 1; i++) {
          if (!(await animateHop(rev[i], rev[i + 1], FLAG_SYN | FLAG_ACK, ANIM_MS * 0.5))) return;
        }
        get()._incrementMetric(sourceId, 'packetsReceived');
        get()._incrementMetric(sourceId, 'bytesTransferred', HEADER_BYTES);

        get()._incrementMetric(sourceId, 'packetsSent');
        get()._incrementMetric(sourceId, 'bytesTransferred', HEADER_BYTES);
        const ackPkt: RUDPPacket = { id: uuidv4().slice(0, 8), header: { flags: FLAG_ACK, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() }, payload: '' };
        get()._addPacketEvent(createPacketEvent(ackPkt, sourceId, targetId, 'sent', 'rudp'));
        for (let i = 0; i < path.length - 1; i++) {
          if (!(await animateHop(path[i], path[i + 1], FLAG_ACK, ANIM_MS * 0.5))) return;
        }
        get()._incrementMetric(targetId, 'packetsReceived');
        get()._incrementMetric(targetId, 'bytesTransferred', HEADER_BYTES);
        get()._addLog('success', `RUDP session established ${srcLabel} ↔ ${tgtLabel}`);
      }

      let totalDelay = 0;
      const dataPacket = createDataPacket(1, payload);
      const firstNode = path[0];
      const lastNode = path[path.length - 1];

      get()._addPacketEvent(createPacketEvent(dataPacket, firstNode, lastNode, 'sent', protocol, undefined, path));
      get()._incrementMetric(firstNode, 'packetsSent');
      get()._incrementMetric(firstNode, 'bytesTransferred', payload.length + HEADER_BYTES);

      for (let i = 0; i < path.length - 1; i++) {
        if (cancelled()) return;
        const hopSrc = path[i];
        const hopDst = path[i + 1];
        const hSrc = lbl(get().nodes, hopSrc);
        const hDst = lbl(get().nodes, hopDst);
        const netResult = simulateNetworkConditions(get().config);

        let hopDelay = netResult.delayMs;
        if (protocol === 'tcp') hopDelay += tcpCongestionPenalty;
        totalDelay += hopDelay;

        if (netResult.dropped) {
          get()._addPacketEvent(createPacketEvent(dataPacket, hopSrc, hopDst, 'dropped', protocol));
          get()._incrementMetric(lastNode, 'packetsDropped');
          get()._addLog('error', `DROPPED ${hSrc} → ${hDst} (hop ${i + 1})`);

          if (protocol === 'udp') {
            get()._addLog('warn', `UDP: packet lost at hop ${i + 1}, transfer failed silently`);
            return;
          }

          if (protocol === 'tcp') {
            tcpCongestionPenalty += 600;
            get()._addLog('warn', `TCP cwnd halved, penalty now ${tcpCongestionPenalty}ms`);
          }

          get()._incrementMetric(firstNode, 'packetsRetransmitted');
          get()._addPacketEvent(createPacketEvent(dataPacket, hopSrc, hopDst, 'retransmit', protocol));
          get()._addLog('info', `${protocol.toUpperCase()} retransmitting hop ${i + 1}`);

          if (!(await animateHop(hopSrc, hopDst, FLAG_DATA, ANIM_MS))) return;
        } else {
          if (!(await animateHop(hopSrc, hopDst, FLAG_DATA, ANIM_MS))) return;
        }
      }

      get()._addPacketEvent(createPacketEvent(dataPacket, firstNode, lastNode, 'received', protocol, totalDelay, path));
      get()._incrementMetric(lastNode, 'packetsReceived');
      get()._incrementMetric(lastNode, 'bytesTransferred', payload.length + HEADER_BYTES);

      if (protocol === 'udp') {
        get()._addLog('success', `UDP delivered ${srcLabel} → ${tgtLabel} (${totalDelay}ms, no ACK, no integrity check)`);
        const dstNode = get().nodes.find(n => n.id === targetId);
        if (dstNode) {
          const rc = dstNode.metrics.packetsReceived;
          get()._updateNodeMetrics(targetId, { avgLatencyMs: rc > 0 ? (dstNode.metrics.avgLatencyMs * (rc - 1) + totalDelay) / rc : totalDelay });
        }
        return;
      }

      if (cancelled()) return;

      const isAdaptiveRudp = (protocol === 'rudp' && payload.length >= 1024);
      const skipExplicitAck = isAdaptiveRudp && Math.random() > 0.4; // 60% chance to simulate cumulative ACK

      if (skipExplicitAck) {
        get()._addLog('success', `Adaptive RUDP: Cumulative ACK applied ${tgtLabel} → ${srcLabel} (saves transit time)`);
        get()._incrementMetric(targetId, 'packetsSent');
        get()._incrementMetric(targetId, 'bytesTransferred', HEADER_BYTES);
        get()._incrementMetric(sourceId, 'packetsReceived');
        get()._incrementMetric(sourceId, 'bytesTransferred', HEADER_BYTES);
      } else {
        get()._addLog('info', `ACK ${tgtLabel} → ${srcLabel} (end-to-end)`);
        get()._incrementMetric(targetId, 'packetsSent');
        get()._incrementMetric(targetId, 'bytesTransferred', HEADER_BYTES);
        const ackPkt: RUDPPacket = { id: uuidv4().slice(0, 8), header: { flags: FLAG_ACK, seqNum: 0, ackNum: path.length - 1, checksum: 0, payloadLen: 0, timestamp: Date.now() }, payload: '' };

        const reversePath = [...path].reverse();
        for (let i = 0; i < reversePath.length - 1; i++) {
          if (cancelled()) return;
          get()._addPacketEvent(createPacketEvent(ackPkt, reversePath[i], reversePath[i + 1], 'sent', protocol));
          if (!(await animateHop(reversePath[i], reversePath[i + 1], FLAG_ACK, ACK_ANIM_MS))) return;
        }

        get()._incrementMetric(sourceId, 'packetsReceived');
        get()._incrementMetric(sourceId, 'bytesTransferred', HEADER_BYTES);
      }

      get()._addLog('success', `${protocol.toUpperCase()} complete: ${srcLabel} → ${tgtLabel} (${totalDelay}ms, ACK confirmed)`);
      const dstNode = get().nodes.find(n => n.id === targetId);
      if (dstNode) {
        const rc = dstNode.metrics.packetsReceived;
        get()._updateNodeMetrics(targetId, { avgLatencyMs: rc > 0 ? (dstNode.metrics.avgLatencyMs * (rc - 1) + totalDelay) / rc : totalDelay });
      }
    };

    simulateTransfer();
  },

  updateConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),
  startAutoSend: () => {
    const s = get();
    if (s.nodes.length < 2) { get()._addLog('error', 'Need at least 2 nodes'); return; }
    tcpCongestionPenalty = 0;
    get()._addLog('info', `Auto-send started [${s.activeProtocol.toUpperCase()}, ${s.config.autoSendInterval}ms, ${s.config.autoPayloadSize}B]`);
    const timerId = setInterval(() => {
      const gs = get();
      if (gs.nodes.length < 2) return;
      const srcIdx = Math.floor(Math.random() * gs.nodes.length);
      let tgtIdx = Math.floor(Math.random() * gs.nodes.length);
      while (tgtIdx === srcIdx) tgtIdx = Math.floor(Math.random() * gs.nodes.length);
      gs.sendData(gs.nodes[srcIdx].id, gs.nodes[tgtIdx].id, generateRandomPayload(gs.config.autoPayloadSize));
    }, s.config.autoSendInterval);
    set({ isRunning: true, autoSendTimerId: timerId });
  },
  stopAutoSend: () => {
    const timerId = get().autoSendTimerId;
    if (timerId) clearInterval(timerId);
    set((s) => ({ isRunning: false, autoSendTimerId: null, animatedPackets: [], _epoch: s._epoch + 1 }));
    get()._addLog('warn', 'Auto-send stopped');
  },

  clearLogs: () => set({ logs: [] }),
  clearPacketLog: () => set({ packetLog: [] }),
  resetSimulation: () => {
    const timerId = get().autoSendTimerId;
    if (timerId) clearInterval(timerId);
    tcpCongestionPenalty = 0;
    set((s) => ({
      packetLog: [], logs: [], animatedPackets: [], isRunning: false, autoSendTimerId: null, sessions: new Map(),
      _epoch: s._epoch + 1,
      nodes: s.nodes.map(n => ({
        ...n, metrics: { ...n.metrics, packetsSent: 0, packetsReceived: 0, packetsDropped: 0, packetsRetransmitted: 0, bytesTransferred: 0, avgLatencyMs: 0 }
      }))
    }));
    get()._addLog('warn', 'Simulation reset');
  },

  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setShowNodeConfig: (id) => set({ showNodeConfig: id }),
  addAnimatedPacket: (pkt) => set((s) => ({ animatedPackets: [...s.animatedPackets, pkt] })),
  removeAnimatedPacket: (id) => set((s) => ({ animatedPackets: s.animatedPackets.filter((p) => p.id !== id) })),
  _addLog: (level, message) => set((s) => ({ logs: [{ id: uuidv4().slice(0, 8), timestamp: Date.now(), level, message }, ...s.logs].slice(0, 500) })),
  _addPacketEvent: (event) => set((s) => ({ packetLog: [event, ...s.packetLog].slice(0, 3000) })),
  _updateNodeMetrics: (nodeId, update) => set((s) => ({ nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, metrics: { ...n.metrics, ...update } } : n) })),
  _incrementMetric: (nodeId, field, amount = 1) => set((s) => ({ nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, metrics: { ...n.metrics, [field]: (n.metrics[field] as number) + amount } } : n) })),
}));
