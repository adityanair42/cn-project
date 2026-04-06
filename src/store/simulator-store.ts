// =============================================================================
// Simulator Store — Zustand global state for the entire simulation
// =============================================================================

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type {
  SimNode, SimLink, PacketEvent, SimulationConfig, ProtocolMode, NodeMetrics, RUDPPacket,
} from '../lib/protocol/types';
import { FLAG_SYN, FLAG_ACK, FLAG_DATA } from '../lib/protocol/types';
import { createPacketEvent, createDataPacket, type RUDPSession } from '../lib/protocol/rudp-engine';
import { simulateNetworkConditions } from '../lib/simulation/network-sim';
import { createNode, createLink, findPath, getLinkBetween } from '../lib/simulation/topology';

interface ActiveTransfer {
  id: string; sourceId: string; targetId: string; protocol: ProtocolMode;
  session: RUDPSession | null; path: string[]; currentHop: number; payload: string; startTime: number;
  status: 'handshaking' | 'sending' | 'complete' | 'failed';
}

interface AnimatedPacket {
  id: string; sourceNodeId: string; targetNodeId: string; flags: number;
  progress: number; startTime: number; duration: number; protocol: ProtocolMode;
}

interface SimulatorStore {
  nodes: SimNode[]; links: SimLink[]; selectedNodeId: string | null; selectedLinkId: string | null;
  activeProtocol: ProtocolMode; sessions: Map<string, RUDPSession>;
  config: SimulationConfig; isRunning: boolean; autoSendTimerId: ReturnType<typeof setInterval> | null;
  packetLog: PacketEvent[]; animatedPackets: AnimatedPacket[]; activeTransfers: ActiveTransfer[];
  showSettings: boolean; showNodeConfig: string | null; inspectorTab: 'packets' | 'telemetry' | 'logs';
  logs: Array<{ id: string; timestamp: number; level: 'info' | 'warn' | 'error' | 'success'; message: string }>;
  theme: 'dark' | 'light';

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function generateRandomPayload(size: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < size; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

// Global simulated congestion window tracking for TCP
let tcpCongestionDelayMs = 0;

export const useSimulatorStore = create<SimulatorStore>((set, get) => ({
  nodes: [], links: [], selectedNodeId: null, selectedLinkId: null,
  activeProtocol: 'rudp', sessions: new Map(), config: defaultConfig,
  isRunning: false, autoSendTimerId: null,
  packetLog: [], animatedPackets: [], activeTransfers: [],
  showSettings: false, showNodeConfig: null, inspectorTab: 'packets', logs: [], theme: 'dark',

  addNode: (x, y, type = 'endpoint') => {
    const node = createNode(x, y, type);
    set((s) => ({ nodes: [...s.nodes, node] }));
    get()._addLog('info', `Node ${node.label} added`);
    return node;
  },
  removeNode: (id) => {
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id), links: s.links.filter((l) => l.source !== id && l.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
    get()._addLog('info', `Node removed`);
  },
  addLink: (sourceId, targetId) => {
    const existing = get().links.find((l) => (l.source === sourceId && l.target === targetId) || (l.source === targetId && l.target === sourceId));
    if (existing) return;
    set((s) => ({ links: [...s.links, createLink(sourceId, targetId)] }));
  },
  removeLink: (id) => set((s) => ({ links: s.links.filter((l) => l.id !== id) })),
  updateNodePosition: (id, x, y) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) })),
  selectNode: (id) => set({ selectedNodeId: id, selectedLinkId: null }),
  selectLink: (id) => set({ selectedLinkId: id, selectedNodeId: null }),
  setProtocol: (mode) => { set({ activeProtocol: mode }); get()._addLog('info', `Protocol switched to ${mode.toUpperCase()}`); },

  sendData: (sourceId, targetId, payload) => {
    const state = get();
    const protocol = state.activeProtocol;
    const path = findPath(state.nodes, state.links, sourceId, targetId);
    if (!path) {
      get()._addLog('error', `NO ROUTE available right now`);
      return;
    }

    const simulateHops = async () => {
      // Artificial delay for TCP based on recent congestion to form "waves" over time intervals
      if (protocol === 'tcp') {
        if (tcpCongestionDelayMs > 0) await delay(tcpCongestionDelayMs);
        tcpCongestionDelayMs = Math.max(0, tcpCongestionDelayMs - 100); // TCP Window Recovery Phase
      }

      for (let i = 0; i < path.length - 1; i++) {
        const hopSrc = path[i];
        const hopDst = path[i + 1];
        const netResult = simulateNetworkConditions(get().config);
        
        let actualDelay = netResult.delayMs;
        if (protocol === 'tcp') actualDelay += tcpCongestionDelayMs;

        const dataPacket = createDataPacket(i + 1, payload);
        get()._addPacketEvent(createPacketEvent(dataPacket, hopSrc, hopDst, 'sent', protocol, undefined, path));
        get()._incrementMetric(hopSrc, 'packetsSent');
        // Gross Throughput
        get()._incrementMetric(hopSrc, 'bytesTransferred', payload.length + 32); 

        if (netResult.dropped && protocol !== 'tcp') {
          get()._addPacketEvent(createPacketEvent(dataPacket, hopSrc, hopDst, 'dropped', protocol));
          get()._incrementMetric(hopDst, 'packetsDropped');
          if (protocol === 'udp') continue; // UDP ignores drop and succeeds silently
        }

        const animDuration = Math.max(400, actualDelay);
        const dataAnimId = uuidv4().slice(0, 8);
        get().addAnimatedPacket({ id: dataAnimId, sourceNodeId: hopSrc, targetNodeId: hopDst, flags: FLAG_DATA, progress: 0, startTime: Date.now(), duration: animDuration, protocol: protocol });
        await delay(animDuration);
        get().removeAnimatedPacket(dataAnimId);

        if (netResult.dropped && (protocol === 'tcp' || protocol === 'rudp')) {
          get()._incrementMetric(hopSrc, 'packetsRetransmitted');
          get()._addPacketEvent(createPacketEvent(dataPacket, hopSrc, hopDst, 'retransmit', protocol));

          if (protocol === 'tcp') {
             // TCP Halves window / adds massive simulated delay penalty
             tcpCongestionDelayMs += 800; 
          }

          const retAnimId = uuidv4().slice(0, 8);
          get().addAnimatedPacket({ id: retAnimId, sourceNodeId: hopSrc, targetNodeId: hopDst, flags: FLAG_DATA, progress: 0, startTime: Date.now(), duration: animDuration, protocol: protocol });
          await delay(animDuration);
          get().removeAnimatedPacket(retAnimId);
        }

        get()._addPacketEvent(createPacketEvent(dataPacket, hopSrc, hopDst, 'received', protocol, actualDelay, path));
        get()._incrementMetric(hopDst, 'packetsReceived');
        get()._incrementMetric(hopDst, 'bytesTransferred', payload.length + 32); 

        if (protocol === 'tcp' || protocol === 'rudp') {
          const ackPkt: RUDPPacket = { id: uuidv4().slice(0, 8), header: { flags: FLAG_ACK, seqNum: 0, ackNum: i + 1, checksum: 0, payloadLen: 0, timestamp: Date.now() }, payload: '' };
          get()._addPacketEvent(createPacketEvent(ackPkt, hopDst, hopSrc, 'sent', protocol));

          const ackAnimId2 = uuidv4().slice(0, 8);
          get().addAnimatedPacket({ id: ackAnimId2, sourceNodeId: hopDst, targetNodeId: hopSrc, flags: FLAG_ACK, progress: 0, startTime: Date.now(), duration: Math.max(200, actualDelay / 2), protocol: protocol });
          await delay(Math.max(200, actualDelay / 2));
          get().removeAnimatedPacket(ackAnimId2);
        }

        const dstNode = get().nodes.find((n) => n.id === hopDst);
        if (dstNode) {
          get()._updateNodeMetrics(hopDst, {
            avgLatencyMs: (dstNode.metrics.avgLatencyMs * dstNode.metrics.packetsReceived + actualDelay) / (dstNode.metrics.packetsReceived + 1),
          });
        }
      }
    };
    simulateHops();
  },

  updateConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),
  startAutoSend: () => {
    const s = get();
    if (s.nodes.length < 2) return;
    tcpCongestionDelayMs = 0; // Reset tcp wave
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
    set({ isRunning: false, autoSendTimerId: null });
  },

  clearLogs: () => set({ logs: [] }), clearPacketLog: () => set({ packetLog: [] }),
  resetSimulation: () => {
    const timerId = get().autoSendTimerId;
    if (timerId) clearInterval(timerId);
    tcpCongestionDelayMs = 0;
    set((s) => ({
      packetLog: [], logs: [], animatedPackets: [], activeTransfers: [],
      isRunning: false, autoSendTimerId: null, sessions: new Map(),
      nodes: s.nodes.map(n => ({
        ...n, metrics: { ...n.metrics, packetsSent: 0, packetsReceived: 0, packetsDropped: 0, packetsRetransmitted: 0, bytesTransferred: 0, avgLatencyMs: 0 }
      }))
    }));
  },

  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  setInspectorTab: (tab) => set({ inspectorTab: tab }), toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  setShowNodeConfig: (id) => set({ showNodeConfig: id }),

  addAnimatedPacket: (pkt) => set((s) => ({ animatedPackets: [...s.animatedPackets, pkt] })),
  removeAnimatedPacket: (id) => set((s) => ({ animatedPackets: s.animatedPackets.filter((p) => p.id !== id) })),
  _addLog: (level, message) => set((s) => ({ logs: [{ id: uuidv4().slice(0, 8), timestamp: Date.now(), level, message }, ...s.logs].slice(0, 500) })),
  _addPacketEvent: (event) => set((s) => ({ packetLog: [event, ...s.packetLog].slice(0, 3000) })), // Expanded packet logger for metrics window
  _updateNodeMetrics: (nodeId, update) => set((s) => ({ nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, metrics: { ...n.metrics, ...update } } : n) })),
  _incrementMetric: (nodeId, field, amount = 1) => set((s) => ({ nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, metrics: { ...n.metrics, [field]: (n.metrics[field] as number) + amount } } : n) })),
}));
