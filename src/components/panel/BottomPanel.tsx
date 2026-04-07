'use client';

import React, { useMemo } from 'react';
import { useSimulatorStore } from '@/store/simulator-store';

function MiniWaveformLine({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ height: 32, flex: 1, display: 'flex', alignItems: 'center', fontSize: 10, color: '#9ca3af' }}>Waiting for data...</div>;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 140},${32 - (v / max) * 28}`).join(' ');
  return (
    <svg width="140" height="32" viewBox="0 0 140 32" style={{ flexShrink: 0 }}>
      <polygon points={`0,32 ${pts} 140,32`} fill={`${color}20`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BottomPanel() {
  const nodes = useSimulatorStore((s) => s.nodes);
  const links = useSimulatorStore((s) => s.links);
  const packetLog = useSimulatorStore((s) => s.packetLog);
  const activeProtocol = useSimulatorStore((s) => s.activeProtocol);
  const config = useSimulatorStore((s) => s.config);

  const stats = useMemo(() => {
    const sent = nodes.reduce((a, n) => a + n.metrics.packetsSent, 0);
    const recv = nodes.reduce((a, n) => a + n.metrics.packetsReceived, 0);
    const drop = nodes.reduce((a, n) => a + n.metrics.packetsDropped, 0);
    const retx = nodes.reduce((a, n) => a + n.metrics.packetsRetransmitted, 0);

    const totalBytesOnWire = nodes.reduce((a, n) => a + n.metrics.bytesTransferred, 0);
    const headerBytesEstimate = sent * 32;
    const overheadPercent = totalBytesOnWire > 0 ? ((headerBytesEstimate / totalBytesOnWire) * 100).toFixed(1) : '0.0';
    const retxRatio = sent > 0 ? ((retx / sent) * 100).toFixed(1) : '0.0';
    const deliveryRate = sent > 0 ? ((recv / sent) * 100).toFixed(1) : '0.0';

    const now = Date.now();
    const rawBuckets = new Array(25).fill(0);
    packetLog.forEach((p) => {
      if (p.direction === 'received') {
        const age = Math.floor((now - p.timestamp) / 500);
        if (age >= 0 && age < 25) rawBuckets[age] += p.payloadLen;
      }
    });

    // Apply a 3-period moving average to smooth out micro-jitter from 
    // retransmissions falling across tight 500ms bucket boundaries.
    const buckets = rawBuckets.map((val, i, arr) => {
      const prev = arr[i - 1] ?? val;
      const next = arr[i + 1] ?? val;
      return (prev + val + next) / 3;
    });

    const throughputWaveform = buckets.reverse();
    const recentThroughput = throughputWaveform.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const currentTPS = packetLog.filter(p => p.direction === 'sent' && (now - p.timestamp) < 1000).length;

    return { sent, recv, drop, retx, overheadPercent, retxRatio, deliveryRate, recentThroughput, throughputWaveform, currentTPS };
  }, [nodes, packetLog]);

  const protocolColor = activeProtocol === 'tcp' ? '#22c55e' : activeProtocol === 'udp' ? '#f59e0b' : '#3b82f6';

  return (
    <div style={{ background: '#0a0d14', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between" style={{ padding: '8px 20px', borderBottom: '1px solid #1e2030', background: '#0d1017', flexShrink: 0 }}>
        <div className="flex items-center gap-4">
          <span style={{ fontSize: 11, fontWeight: 700, color: protocolColor, letterSpacing: '0.05em' }}>{activeProtocol.toUpperCase()} MODE</span>
          <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>Network Analysis</span>
        </div>
        <div className="flex items-center gap-4" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#9ca3af' }}>
          <span>Delay <span style={{ color: '#e5e7eb' }}>{config.latencyMs.toFixed(0)}ms</span></span>
          <span>Loss <span style={{ color: config.packetLossPercent > 10 ? '#ef4444' : '#e5e7eb' }}>{config.packetLossPercent.toFixed(1)}%</span></span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto" style={{ padding: 16 }}>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>

          <div style={{ background: '#141722', borderRadius: 10, border: '1px solid #1e2233', padding: 14 }}>
            <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Throughput Over Time</span>
              <span style={{ fontSize: 15, color: '#e5e7eb', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                {(stats.recentThroughput * 2 / 1024).toFixed(1)} KB/s
              </span>
            </div>
            <MiniWaveformLine data={stats.throughputWaveform} color={protocolColor} />
            <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 8, lineHeight: '1.4' }}>
              Measures successfully delivered payload bytes across 500ms windows.
              TCP shows sawtooth wave under loss. UDP stays flat. RUDP recovers faster.
            </div>
          </div>

          <div style={{ background: '#141722', borderRadius: 10, border: '1px solid #1e2233', padding: 14 }}>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 14 }}>Protocol Efficiency</span>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div style={{ fontSize: 22, color: '#ef4444', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stats.retxRatio}%</div>
                <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' }}>Retransmit Rate</div>
              </div>
              <div>
                <div style={{ fontSize: 22, color: '#a78bfa', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stats.overheadPercent}%</div>
                <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' }}>Header Overhead</div>
              </div>
              <div>
                <div style={{ fontSize: 22, color: '#22c55e', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stats.deliveryRate}%</div>
                <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' }}>Delivery Rate</div>
              </div>
              <div>
                <div style={{ fontSize: 22, color: '#2dd4bf', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stats.currentTPS}</div>
                <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase' }}>Packets / Sec</div>
              </div>
            </div>
          </div>

          <div style={{ background: '#141722', borderRadius: 10, border: '1px solid #1e2233', padding: 14 }}>
            <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 14 }}>Topology & Load</span>
            {[
              { label: 'Active Nodes', value: String(nodes.length), color: '#e5e7eb' },
              { label: 'Logical Links', value: String(links.length), color: '#e5e7eb' },
              { label: 'Total Sent', value: String(stats.sent), color: '#3b82f6' },
              { label: 'Total Received', value: String(stats.recv), color: '#22c55e' },
              { label: 'Total Dropped', value: String(stats.drop), color: '#ef4444' },
              { label: 'Total Retransmit', value: String(stats.retx), color: '#f59e0b' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between" style={{ padding: '4px 0', borderBottom: '1px solid #1e203060' }}>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{row.label}</span>
                <span style={{ fontSize: 12, color: row.color, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{row.value}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
