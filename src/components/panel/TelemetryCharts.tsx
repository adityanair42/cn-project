'use client';

import React, { useMemo } from 'react';
import { useSimulatorStore } from '@/store/simulator-store';

function Sparkline({ data, color, height = 36 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#2a2d3e' }}>—</div>;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 180;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - ((v - min) / range) * (height - 4)}`);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`g-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(' ')} ${w},${height}`} fill={`url(#g-${color.slice(1)})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TelemetryCharts() {
  const nodes = useSimulatorStore((s) => s.nodes);
  const packetLog = useSimulatorStore((s) => s.packetLog);

  const m = useMemo(() => {
    const sent = nodes.reduce((a, n) => a + n.metrics.packetsSent, 0);
    const recv = nodes.reduce((a, n) => a + n.metrics.packetsReceived, 0);
    const dropped = nodes.reduce((a, n) => a + n.metrics.packetsDropped, 0);
    const retx = nodes.reduce((a, n) => a + n.metrics.packetsRetransmitted, 0);
    const bytes = nodes.reduce((a, n) => a + n.metrics.bytesTransferred, 0);
    const active = nodes.filter(n => n.metrics.avgLatencyMs > 0);
    const avgLat = active.length > 0 ? active.reduce((a, n) => a + n.metrics.avgLatencyMs, 0) / active.length : 0;
    const loss = sent > 0 ? (dropped / sent * 100) : 0;
    const latencies = packetLog.filter(p => p.direction === 'received' && p.latencyMs !== undefined).slice(0, 30).map(p => p.latencyMs!).reverse();
    const sizes = packetLog.filter(p => p.direction === 'sent').slice(0, 30).map(p => p.payloadLen).reverse();

    return { sent, recv, dropped, retx, bytes, avgLat, loss, latencies, sizes };
  }, [nodes, packetLog]);

  const cards = [
    { label: 'Avg Latency', value: m.avgLat.toFixed(1), unit: 'ms', data: m.latencies, color: '#2dd4bf' },
    { label: 'Throughput', value: m.bytes > 1024 ? (m.bytes / 1024).toFixed(1) : String(m.bytes), unit: m.bytes > 1024 ? 'KB' : 'B', data: m.sizes, color: '#3b82f6' },
    { label: 'Packet Loss', value: m.loss.toFixed(1), unit: '%', data: [m.loss], color: '#ef4444' },
    { label: 'Retransmits', value: String(m.retx), unit: 'pkts', data: [m.retx], color: '#f59e0b' },
  ];

  const counters = [
    { val: m.sent, label: 'Sent', color: '#3b82f6' },
    { val: m.recv, label: 'Received', color: '#22c55e' },
    { val: m.dropped, label: 'Dropped', color: '#ef4444' },
  ];

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        Network Telemetry
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <div key={c.label} style={{ background: '#1a1d28', borderRadius: 10, padding: 12, border: '1px solid #252836' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <div className="flex items-center gap-1.5">
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color }} />
                <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</span>
              </div>
              <div>
                <span style={{ fontSize: 16, fontWeight: 700, color: '#e5e7eb' }}>{c.value}</span>
                <span style={{ fontSize: 10, color: '#4b5563', marginLeft: 3 }}>{c.unit}</span>
              </div>
            </div>
            <Sparkline data={c.data} color={c.color} />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {counters.map((c) => (
          <div key={c.label} style={{
            textAlign: 'center', padding: '10px 0', borderRadius: 10,
            background: '#1a1d28', border: '1px solid #252836',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c.color, fontVariantNumeric: 'tabular-nums' }}>{c.val}</div>
            <div style={{ fontSize: 10, color: '#4b5563', fontWeight: 600, textTransform: 'uppercase', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
