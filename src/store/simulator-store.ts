// =============================================================================
// Simulator Store — Zustand global state for the entire simulation
// =============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  SimNode,
  SimLink,
  PacketEvent,
  SimulationConfig,
  ProtocolMode,
  NodeMetrics,
  RUDPPacket,
} from '../lib/protocol/types';
import {
  FLAG_SYN,
  FLAG_ACK,
  FLAG_DATA,
} from '../lib/protocol/types';
import {
  createSession,
  initiateHandshake,
  handleReceivedPacket,
  prepareDataSend,
  handleTimeout,
  createPacketEvent,
  createDataPacket,
  flagsToString,
  type RUDPSession,
} from '../lib/protocol/rudp-engine';
import { UDPSimulator } from '../lib/protocol/udp-simulator';
import { decideAdaptiveMode } from '../lib/protocol/adaptive';
import { simulateNetworkConditions } from '../lib/simulation/network-sim';
import { createNode, createLink, findPath, getLinkBetween } from '../lib/simulation/topology';

// ---- Store Types ----

interface ActiveTransfer {
  id: string;
  sourceId: string;
  targetId: string;
  protocol: ProtocolMode;
  session: RUDPSession | null;
  path: string[];
  currentHop: number;
  payload: string;
  startTime: number;
  status: 'handshaking' | 'sending' | 'complete' | 'failed';
}

interface AnimatedPacket {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  flags: number;
  progress: number; // 0-1 animation progress
  startTime: number;
  duration: number;  // ms
  protocol: ProtocolMode;
}

interface SimulatorStore {
  // ---- Topology ----
  nodes: SimNode[];
  links: SimLink[];
  selectedNodeId: string | null;
  selectedLinkId: string | null;

  // ---- Protocol ----
  activeProtocol: ProtocolMode;
  sessions: Map<string, RUDPSession>;

  // ---- Simulation ----
  config: SimulationConfig;
  isRunning: boolean;
  autoSendTimerId: ReturnType<typeof setInterval> | null;

  // ---- Telemetry ----
  packetLog: PacketEvent[];
  animatedPackets: AnimatedPacket[];
  activeTransfers: ActiveTransfer[];

  // ---- UI ----
  showSettings: boolean;
  showNodeConfig: string | null;
  inspectorTab: 'packets' | 'telemetry' | 'logs';
  logs: Array<{ id: string; timestamp: number; level: 'info' | 'warn' | 'error' | 'success'; message: string }>;
  theme: 'dark' | 'light';

  // ---- Actions: Topology ----
  addNode: (x: number, y: number, type?: SimNode['type']) => SimNode;
  removeNode: (id: string) => void;
  addLink: (sourceId: string, targetId: string) => void;
  removeLink: (id: string) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  selectNode: (id: string | null) => void;
  selectLink: (id: string | null) => void;

  // ---- Actions: Protocol ----
  setProtocol: (mode: ProtocolMode) => void;
  sendData: (sourceId: string, targetId: string, payload: string) => void;

  // ---- Actions: Simulation ----
  updateConfig: (partial: Partial<SimulationConfig>) => void;
  startAutoSend: () => void;
  stopAutoSend: () => void;
  clearLogs: () => void;
  clearPacketLog: () => void;

  // ---- Actions: UI ----
  toggleSettings: () => void;
  setInspectorTab: (tab: SimulatorStore['inspectorTab']) => void;
  toggleTheme: () => void;
  setShowNodeConfig: (id: string | null) => void;

  // ---- Actions: Animation ----
  addAnimatedPacket: (pkt: AnimatedPacket) => void;
  removeAnimatedPacket: (id: string) => void;

  // ---- Internal ----
  _addLog: (level: 'info' | 'warn' | 'error' | 'success', message: string) => void;
  _addPacketEvent: (event: PacketEvent) => void;
  _updateNodeMetrics: (nodeId: string, update: Partial<NodeMetrics>) => void;
  _incrementMetric: (nodeId: string, field: keyof NodeMetrics, amount?: number) => void;
}

// Default simulation config
const defaultConfig: SimulationConfig = {
  latencyMs: 80,
  jitterMs: 20,
  packetLossPercent: 5,
  autoSendInterval: 2000,
  autoPayloadSize: 128,
};

export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  // ---- Initial State ----
  nodes: [],
  links: [],
  selectedNodeId: null,
  selectedLinkId: null,
  activeProtocol: 'rudp',
  sessions: new Map(),
  config: defaultConfig,
  isRunning: false,
  autoSendTimerId: null,
  packetLog: [],
  animatedPackets: [],
  activeTransfers: [],
  showSettings: false,
  showNodeConfig: null,
  inspectorTab: 'packets',
  logs: [],
  theme: 'dark',

  // ---- Topology Actions ----
  addNode: (x, y, type = 'endpoint') => {
    const node = createNode(x, y, type);
    set((s) => ({ nodes: [...s.nodes, node] }));
    get()._addLog('info', `Node ${node.label} added`);
    return node;
  },

  removeNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      links: s.links.filter((l) => l.source !== id && l.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
    if (node) get()._addLog('info', `Node ${node.label} removed`);
  },

  addLink: (sourceId, targetId) => {
    const existing = get().links.find(
      (l) =>
        (l.source === sourceId && l.target === targetId) ||
        (l.source === targetId && l.target === sourceId),
    );
    if (existing) return;
    const link = createLink(sourceId, targetId);
    set((s) => ({ links: [...s.links, link] }));
    const src = get().nodes.find((n) => n.id === sourceId);
    const tgt = get().nodes.find((n) => n.id === targetId);
    get()._addLog('info', `Link ${src?.label} ↔ ${tgt?.label} created`);
  },

  removeLink: (id) => {
    set((s) => ({
      links: s.links.filter((l) => l.id !== id),
      selectedLinkId: s.selectedLinkId === id ? null : s.selectedLinkId,
    }));
    get()._addLog('info', `Link removed`);
  },

  updateNodePosition: (id, x, y) => {
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    }));
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedLinkId: null }),
  selectLink: (id) => set({ selectedLinkId: id, selectedNodeId: null }),

  // ---- Protocol Actions ----
  setProtocol: (mode) => {
    set({ activeProtocol: mode });
    get()._addLog('info', `Protocol switched to ${mode.toUpperCase()}`);
  },

  sendData: (sourceId, targetId, payload) => {
    const state = get();
    const protocol = state.activeProtocol;
    const src = state.nodes.find((n) => n.id === sourceId);
    const tgt = state.nodes.find((n) => n.id === targetId);
    if (!src || !tgt) {
      get()._addLog('error', 'Source or target node not found');
      return;
    }

    // Find path
    const path = findPath(state.nodes, state.links, sourceId, targetId);
    if (!path) {
      get()._addLog('error', `No path from ${src.label} to ${tgt.label}`);
      return;
    }

    get()._addLog('info', `Sending "${payload.slice(0, 30)}${payload.length > 30 ? '...' : ''}" from ${src.label} → ${tgt.label} via ${protocol.toUpperCase()} (${path.length - 1} hops)`);

    // Decide effective protocol behavior
    let effectiveProtocol = protocol;
    if (protocol === 'adaptive') {
      const decision = decideAdaptiveMode(payload.length, state.config);
      effectiveProtocol = decision.effectiveMode === 'rudp-lite' ? 'rudp' : decision.effectiveMode === 'tcp' ? 'tcp' : 'udp';
      get()._addLog('info', `Adaptive decision: ${decision.reason} → ${decision.effectiveMode}`);
    }

    const startTime = Date.now();

    // Simulate the transfer hop by hop
    const simulateHops = async () => {
      for (let i = 0; i < path.length - 1; i++) {
        const hopSrc = path[i];
        const hopDst = path[i + 1];
        const link = getLinkBetween(state.links, hopSrc, hopDst);
        const netResult = simulateNetworkConditions(state.config);

        const hopSrcNode = get().nodes.find((n) => n.id === hopSrc);
        const hopDstNode = get().nodes.find((n) => n.id === hopDst);

        if (effectiveProtocol === 'tcp' || effectiveProtocol === 'rudp') {
          // ---- HANDSHAKE (only on first hop for simplicity) ----
          if (i === 0) {
            // SYN
            const synPacket: RUDPPacket = {
              id: uuidv4().slice(0, 8),
              header: { flags: FLAG_SYN, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() },
              payload: '',
            };
            const synEvent = createPacketEvent(synPacket, hopSrc, hopDst, 'sent', effectiveProtocol);
            get()._addPacketEvent(synEvent);
            get()._incrementMetric(hopSrc, 'packetsSent');

            // Animate SYN
            const synAnimId = uuidv4().slice(0, 8);
            get().addAnimatedPacket({
              id: synAnimId, sourceNodeId: hopSrc, targetNodeId: hopDst,
              flags: FLAG_SYN, progress: 0, startTime: Date.now(),
              duration: Math.max(300, netResult.delayMs), protocol: effectiveProtocol,
            });
            await delay(Math.max(300, netResult.delayMs));
            get().removeAnimatedPacket(synAnimId);

            // SYN-ACK
            const synAckPacket: RUDPPacket = {
              id: uuidv4().slice(0, 8),
              header: { flags: FLAG_SYN | FLAG_ACK, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() },
              payload: '',
            };
            const synAckEvent = createPacketEvent(synAckPacket, hopDst, hopSrc, 'sent', effectiveProtocol);
            get()._addPacketEvent(synAckEvent);
            get()._incrementMetric(hopDst, 'packetsSent');

            const saAnimId = uuidv4().slice(0, 8);
            get().addAnimatedPacket({
              id: saAnimId, sourceNodeId: hopDst, targetNodeId: hopSrc,
              flags: FLAG_SYN | FLAG_ACK, progress: 0, startTime: Date.now(),
              duration: Math.max(300, netResult.delayMs), protocol: effectiveProtocol,
            });
            await delay(Math.max(300, netResult.delayMs));
            get().removeAnimatedPacket(saAnimId);

            // ACK
            const ackPacket: RUDPPacket = {
              id: uuidv4().slice(0, 8),
              header: { flags: FLAG_ACK, seqNum: 0, ackNum: 0, checksum: 0, payloadLen: 0, timestamp: Date.now() },
              payload: '',
            };
            const ackEvent = createPacketEvent(ackPacket, hopSrc, hopDst, 'sent', effectiveProtocol);
            get()._addPacketEvent(ackEvent);
            get()._incrementMetric(hopSrc, 'packetsSent');

            const ackAnimId = uuidv4().slice(0, 8);
            get().addAnimatedPacket({
              id: ackAnimId, sourceNodeId: hopSrc, targetNodeId: hopDst,
              flags: FLAG_ACK, progress: 0, startTime: Date.now(),
              duration: Math.max(200, netResult.delayMs / 2), protocol: effectiveProtocol,
            });
            await delay(Math.max(200, netResult.delayMs / 2));
            get().removeAnimatedPacket(ackAnimId);

            get()._addLog('success', `Handshake complete: ${hopSrcNode?.label} ↔ ${hopDstNode?.label}`);
          }
        }

        // ---- DATA PACKET ----
        const dataPacket = createDataPacket(i + 1, payload);
        const dataEvent = createPacketEvent(dataPacket, hopSrc, hopDst, 'sent', effectiveProtocol, undefined, path);
        get()._addPacketEvent(dataEvent);
        get()._incrementMetric(hopSrc, 'packetsSent');
        get()._incrementMetric(hopSrc, 'bytesTransferred', payload.length);

        if (netResult.dropped && effectiveProtocol !== 'tcp') {
          // Packet dropped (UDP just loses it, TCP would retransmit)
          const dropEvent = createPacketEvent(dataPacket, hopSrc, hopDst, 'dropped', effectiveProtocol);
          get()._addPacketEvent(dropEvent);
          get()._incrementMetric(hopDst, 'packetsDropped');
          get()._addLog('warn', `Packet dropped on ${hopSrcNode?.label} → ${hopDstNode?.label}`);

          if (effectiveProtocol === 'udp') {
            // UDP: just move on, packet is lost
            continue;
          }
        }

        // Animate data packet
        const dataAnimId = uuidv4().slice(0, 8);
        const animDuration = Math.max(400, netResult.delayMs);
        get().addAnimatedPacket({
          id: dataAnimId, sourceNodeId: hopSrc, targetNodeId: hopDst,
          flags: FLAG_DATA, progress: 0, startTime: Date.now(),
          duration: animDuration, protocol: effectiveProtocol,
        });
        await delay(animDuration);
        get().removeAnimatedPacket(dataAnimId);

        // Handle retransmit for dropped + reliable protocol
        if (netResult.dropped && (effectiveProtocol === 'tcp' || effectiveProtocol === 'rudp')) {
          get()._addLog('warn', `Timeout on ${hopSrcNode?.label} → ${hopDstNode?.label}. Retransmitting...`);
          get()._incrementMetric(hopSrc, 'packetsRetransmitted');

          const retransmitEvent = createPacketEvent(dataPacket, hopSrc, hopDst, 'retransmit', effectiveProtocol);
          get()._addPacketEvent(retransmitEvent);

          const retAnimId = uuidv4().slice(0, 8);
          get().addAnimatedPacket({
            id: retAnimId, sourceNodeId: hopSrc, targetNodeId: hopDst,
            flags: FLAG_DATA, progress: 0, startTime: Date.now(),
            duration: animDuration, protocol: effectiveProtocol,
          });
          await delay(animDuration);
          get().removeAnimatedPacket(retAnimId);
        }

        // Receive at destination
        const recvEvent = createPacketEvent(dataPacket, hopSrc, hopDst, 'received', effectiveProtocol, netResult.delayMs, path);
        get()._addPacketEvent(recvEvent);
        get()._incrementMetric(hopDst, 'packetsReceived');
        get()._incrementMetric(hopDst, 'bytesTransferred', payload.length);

        // ACK for reliable protocols
        if (effectiveProtocol === 'tcp' || effectiveProtocol === 'rudp') {
          const ackPkt: RUDPPacket = {
            id: uuidv4().slice(0, 8),
            header: { flags: FLAG_ACK, seqNum: 0, ackNum: i + 1, checksum: 0, payloadLen: 0, timestamp: Date.now() },
            payload: '',
          };
          const ackEvt = createPacketEvent(ackPkt, hopDst, hopSrc, 'sent', effectiveProtocol);
          get()._addPacketEvent(ackEvt);

          const ackAnimId2 = uuidv4().slice(0, 8);
          get().addAnimatedPacket({
            id: ackAnimId2, sourceNodeId: hopDst, targetNodeId: hopSrc,
            flags: FLAG_ACK, progress: 0, startTime: Date.now(),
            duration: Math.max(200, netResult.delayMs / 2), protocol: effectiveProtocol,
          });
          await delay(Math.max(200, netResult.delayMs / 2));
          get().removeAnimatedPacket(ackAnimId2);

          get()._addLog('success', `ACK received: ${hopDstNode?.label} → ${hopSrcNode?.label} (Seq: ${i + 1})`);
        }

        // Update latency metrics
        const latency = netResult.delayMs;
        const dstNode = get().nodes.find((n) => n.id === hopDst);
        if (dstNode) {
          const currentMin = dstNode.metrics.minLatencyMs === Infinity ? latency : Math.min(dstNode.metrics.minLatencyMs, latency);
          get()._updateNodeMetrics(hopDst, {
            avgLatencyMs: (dstNode.metrics.avgLatencyMs * dstNode.metrics.packetsReceived + latency) / (dstNode.metrics.packetsReceived + 1),
            maxLatencyMs: Math.max(dstNode.metrics.maxLatencyMs, latency),
            minLatencyMs: currentMin,
          });
        }
      }

      const totalTime = Date.now() - startTime;
      get()._addLog('success', `Transfer complete: ${src.label} → ${tgt.label} in ${totalTime}ms (${effectiveProtocol.toUpperCase()})`);
    };

    simulateHops();
  },

  // ---- Simulation Actions ----
  updateConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),

  startAutoSend: () => {
    const state = get();
    if (state.nodes.length < 2) {
      get()._addLog('error', 'Need at least 2 nodes for auto-send');
      return;
    }
    get()._addLog('info', `Auto-send started (interval: ${state.config.autoSendInterval}ms, size: ${state.config.autoPayloadSize}B)`);

    const timerId = setInterval(() => {
      const s = get();
      if (s.nodes.length < 2) return;
      // Pick random source and target
      const srcIdx = Math.floor(Math.random() * s.nodes.length);
      let tgtIdx = Math.floor(Math.random() * s.nodes.length);
      while (tgtIdx === srcIdx) tgtIdx = Math.floor(Math.random() * s.nodes.length);

      const payload = generateRandomPayload(s.config.autoPayloadSize);
      s.sendData(s.nodes[srcIdx].id, s.nodes[tgtIdx].id, payload);
    }, state.config.autoSendInterval);

    set({ isRunning: true, autoSendTimerId: timerId });
  },

  stopAutoSend: () => {
    const timerId = get().autoSendTimerId;
    if (timerId) clearInterval(timerId);
    set({ isRunning: false, autoSendTimerId: null });
    get()._addLog('info', 'Auto-send stopped');
  },

  clearLogs: () => set({ logs: [] }),
  clearPacketLog: () => set({ packetLog: [] }),

  // ---- UI Actions ----
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  setInspectorTab: (tab) => set({ inspectorTab: tab }),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setShowNodeConfig: (id) => set({ showNodeConfig: id }),

  // ---- Animation Actions ----
  addAnimatedPacket: (pkt) => set((s) => ({ animatedPackets: [...s.animatedPackets, pkt] })),
  removeAnimatedPacket: (id) => set((s) => ({ animatedPackets: s.animatedPackets.filter((p) => p.id !== id) })),

  // ---- Internal helpers ----
  _addLog: (level, message) => {
    set((s) => ({
      logs: [
        { id: uuidv4().slice(0, 8), timestamp: Date.now(), level, message },
        ...s.logs,
      ].slice(0, 500), // Keep last 500 logs
    }));
  },

  _addPacketEvent: (event) => {
    set((s) => ({
      packetLog: [event, ...s.packetLog].slice(0, 1000), // Keep last 1000
    }));
  },

  _updateNodeMetrics: (nodeId, update) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId ? { ...n, metrics: { ...n.metrics, ...update } } : n,
      ),
    }));
  },

  _incrementMetric: (nodeId, field, amount = 1) => {
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, metrics: { ...n.metrics, [field]: (n.metrics[field] as number) + amount } }
          : n,
      ),
    }));
  },
}));

// ---- Helpers ----

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateRandomPayload(size: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < size; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
