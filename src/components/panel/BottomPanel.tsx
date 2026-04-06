'use client';

import React, { useMemo } from 'react';
import { useSimulatorStore } from '@/store/simulator-store';
import { flagsToString } from '@/lib/protocol/rudp-engine';

function MiniSparkline({ data, color, w = 80, h = 20 }: { data: number[]; color: string; w?: number; h?: number }) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 2)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function BottomPanel() {
  const nodes = useSimulatorStore((s) => s.nodes);
  const links = useSimulatorStore((s) => s.links);
  const packetLog = useSimulatorStore((s) => s.packetLog);
  const isRunning = useSimulatorStore((s) => s.isRunning);
  const activeProtocol = useSimulatorStore((s) => s.activeProtocol);
  const config = useSimulatorStore((s) => s.config);
  const animatedPackets = useSimulatorStore((s) => s.animatedPackets);

  const stats = useMemo(() => {
    const sent = nodes.reduce((a, n) => a + n.metrics.packetsSent, 0);
    const recv = nodes.reduce((a, n) => a + n.metrics.packetsReceived, 0);
    const dropped = nodes.reduce((a, n) => a + n.metrics.packetsDropped, 0);
    const retx = nodes.reduce((a, n) => a + n.metrics.packetsRetransmitted, 0);
    const bytes = nodes.reduce((a, n) => a + n.metrics.bytesTransferred, 0);
    const active = nodes.filter(n => n.metrics.avgLatencyMs > 0);
    const avgLat = active.length > 0 ? active.reduce((a, n) => a + n.metrics.avgLatencyMs, 0) / active.length : 0;
    const loss = sent > 0 ? (dropped / sent * 100) : 0;
    const latencies = packetLog.filter(p => p.direction === 'received' && p.latencyMs).slice(0, 20).map(p => p.latencyMs!).reverse();
    const throughput = packetLog.filter(p => p.direction === 'sent').slice(0, 20).map(p => p.payloadLen).reverse();

    return { sent, recv, dropped, retx, bytes, avgLat, loss, latencies, throughput };
  }, [nodes, packetLog]);

  const lastEvents = packetLog.slice(0, 3);

  return (
    <div style={{ background: '#0f1117', borderTop: '1px solid #1e2030', padding: '8px 16px', display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
      <div className="flex items-center gap-2" style={{ marginRight: 8 }}>
        <div className={isRunning ? 'animate-pulse' : ''} style={{ width: 6, height: 6, borderRadius: '50%', background: isRunning ? '#22c55e' : '#2a2d3e' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: isRunning ? '#22c55e' : '#4b5563' }}>
          {isRunning ? 'LIVE' : 'IDLE'}
        </span>
      </div>

      <div style={{ width: 1, height: 24, background: '#1e2030' }} />

      {[
        { label: 'Protocol', value: activeProtocol.toUpperCase(), color: '#3b82f6' },
        { label: 'Nodes', value: String(nodes.length), color: '#6b7280' },
        { label: 'Links', value: String(links.length), color: '#6b7280' },
        { label: 'In Flight', value: String(animatedPackets.length), color: animatedPackets.length > 0 ? '#2dd4bf' : '#4b5563' },
      ].map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span style={{ fontSize: 10, color: '#4b5563', fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</span>
          <span style={{ fontSize: 12, color: item.color, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{item.value}</span>
        </div>
      ))}

      <div style={{ width: 1, height: 24, background: '#1e2030' }} />

      {[
        { label: 'Sent', val: stats.sent, color: '#3b82f6' },
        { label: 'Recv', val: stats.recv, color: '#22c55e' },
        { label: 'Drop', val: stats.dropped, color: '#ef4444' },
        { label: 'Retx', val: stats.retx, color: '#f59e0b' },
      ].map((s) => (
        <div key={s.label} className="flex items-center gap-1">
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, opacity: 0.7 }} />
          <span style={{ fontSize: 10, color: '#4b5563', fontWeight: 600 }}>{s.label}</span>
          <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 700, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{s.val}</span>
        </div>
      ))}

      <div style={{ width: 1, height: 24, background: '#1e2030' }} />

      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 10, color: '#4b5563', fontWeight: 600, textTransform: 'uppercase' }}>Latency</span>
        <MiniSparkline data={stats.latencies} color="#2dd4bf" />
        <span style={{ fontSize: 11, color: '#2dd4bf', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{stats.avgLat.toFixed(0)}ms</span>
      </div>

      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 10, color: '#4b5563', fontWeight: 600, textTransform: 'uppercase' }}>Throughput</span>
        <MiniSparkline data={stats.throughput} color="#3b82f6" />
        <span style={{ fontSize: 11, color: '#3b82f6', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
          {stats.bytes > 1024 ? `${(stats.bytes / 1024).toFixed(1)}KB` : `${stats.bytes}B`}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <span style={{ fontSize: 10, color: '#4b5563', fontWeight: 600, textTransform: 'uppercase' }}>Loss</span>
        <span style={{ fontSize: 11, color: stats.loss > 10 ? '#ef4444' : '#6b7280', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{stats.loss.toFixed(1)}%</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <span style={{ fontSize: 10, color: '#4b5563', fontWeight: 600, textTransform: 'uppercase' }}>Sim</span>
        <span style={{ fontSize: 10, color: '#6b7280', fontFamily: 'var(--font-mono)' }}>{config.latencyMs}ms/{config.jitterMs}ms/{config.packetLossPercent}%</span>
      </div>
    </div>
  );
}
