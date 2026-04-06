'use client';

import React, { useMemo } from 'react';
import { useSimulatorStore } from '@/store/simulator-store';
import { PacketEvent } from '@/lib/protocol/types';

function MiniWaveformLine({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ height: 32, flex: 1, display: 'flex', alignItems: 'center', fontSize: 10, color: '#4b5563' }}>Generating waveform...</div>;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 140},${32 - (v / max) * 32}`).join(' ');
  return (
    <svg width="140" height="32" viewBox="0 0 140 32" style={{ flexShrink: 0 }}>
      {/* Background fill */}
      <polygon points={`0,32 ${pts} 140,32`} fill={`${color}20`} />
      {/* Stroke line */}
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
    const drop = nodes.reduce((a, n) => a + n.metrics.packetsDropped, 0);
    const retx = nodes.reduce((a, n) => a + n.metrics.packetsRetransmitted, 0);
    
    // Header overhead per packet is 32 bytes (mock RUDP/TCP framing)
    const protocolBytesTotal = nodes.reduce((a, n) => a + n.metrics.bytesTransferred, 0);
    const payloadBytesTotal = protocolBytesTotal - (sent * 32); 
    const overheadPercent = protocolBytesTotal > 0 ? ((sent * 32) / protocolBytesTotal * 100).toFixed(1) : '0.0';
    const retxRatio = sent > 0 ? ((retx / sent) * 100).toFixed(1) : '0.0';

    // Calculate throughput over time to draw the actual wave
    const now = Date.now();
    const buckets = new Array(25).fill(0); // 25 buckets of 500ms
    
    packetLog.forEach((p) => {
       if (p.direction === 'received') {
          const ageMs = now - p.timestamp;
          const bucketIndex = Math.floor(ageMs / 500); // which 500ms segment?
          if (bucketIndex >= 0 && bucketIndex < 25) {
             buckets[bucketIndex] += p.payloadLen; // Add payload bytes to that bucket
          }
       }
    });

    const throughputWaveform = buckets.reverse(); // oldest to newest left to right
    const currentGoodput = throughputWaveform[throughputWaveform.length - 1]; // last roughly 500ms chunk
    const currentTPS = packetLog.filter(p => p.direction === 'sent' && (now - p.timestamp) < 1000).length;

    return { 
      payloadBytesTotal, overheadPercent, retxRatio, currentGoodput: currentGoodput * 2, // scale to per-second approx
      throughputWaveform, currentTPS
    };
  }, [nodes, packetLog]);

  return (
    <div style={{ background: '#0a0d14', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header Readout */}
      <div className="flex items-center justify-between" style={{ padding: '8px 20px', borderBottom: '1px solid #1e2030', background: '#0d1017' }}>
         <div className="flex items-center gap-4">
            <span style={{ fontSize: 11, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.05em' }}>{activeProtocol.toUpperCase()} MODE</span>
            <span style={{ fontSize: 11, color: '#6b7280', fontFamily: 'var(--font-mono)' }}>Network Engine Active</span>
         </div>
         <div className="flex items-center gap-4">
            <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Active Nodes</span>
            <span style={{ fontSize: 11, color: '#e5e7eb', fontFamily: 'var(--font-mono)' }}>{nodes.length}</span>
            <div style={{ width: 1, height: 12, background: '#252836' }} />
            <span style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>Env Config</span>
            <span style={{ fontSize: 11, color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>{config.latencyMs.toFixed(0)}ms Del / {config.packetLossPercent.toFixed(1)}% Loss</span>
         </div>
      </div>

      {/* Wrapping metrics dashboard grid */}
      <div className="flex-1 overflow-y-auto" style={{ padding: 20 }}>
         <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>

            {/* Throughput Analyzer */}
            <div style={{ background: '#141722', borderRadius: 12, border: '1px solid #1e2233', padding: 16 }}>
               <div className="flex justify-between" style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Realtime Throughput</span>
                  <span style={{ fontSize: 16, color: '#e5e7eb', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                     {(stats.currentGoodput / 1024).toFixed(1)} KB/s
                  </span>
               </div>
               <div className="flex items-end gap-3 w-full">
                  <MiniWaveformLine data={stats.throughputWaveform} color={activeProtocol === 'tcp' ? '#22c55e' : activeProtocol === 'udp' ? '#f59e0b' : '#3b82f6'} />
               </div>
               <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8, lineHeight: 1.4 }}>Displays successful delivery volume over recent time slices. TCP under loss demonstrates "sawtooth" congestion waving via geometric backoff. UDP remains flatline regardless of drops.</div>
            </div>

            {/* Protocol Efficiency Stats */}
            <div style={{ background: '#141722', borderRadius: 12, border: '1px solid #1e2233', padding: 16 }}>
               <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 16 }}>Data Efficiency & Retx</span>
               
               <div className="grid grid-cols-2 gap-4">
                  <div>
                     <div style={{ fontSize: 24, color: '#ef4444', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stats.retxRatio}%</div>
                     <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' }}>Retransmission Ratio</div>
                  </div>
                  <div>
                     <div style={{ fontSize: 24, color: '#a78bfa', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{stats.overheadPercent}%</div>
                     <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' }}>Header Overhead</div>
                  </div>
               </div>
            </div>

            {/* Traffic Velocity */}
            <div style={{ background: '#141722', borderRadius: 12, border: '1px solid #1e2233', padding: 16 }}>
               <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 16 }}>Network Saturation</span>
               
               <div className="flex items-center justify-between" style={{ borderBottom: '1px solid #1e2030', paddingBottom: 8, marginBottom: 8 }}>
                   <span style={{ fontSize: 11, color: '#9ca3af' }}>Current Trx/Sec</span>
                   <span style={{ fontSize: 12, color: '#2dd4bf', fontFamily: 'var(--font-mono)' }}>{stats.currentTPS} req/s</span>
               </div>
               <div className="flex items-center justify-between">
                   <span style={{ fontSize: 11, color: '#9ca3af' }}>Active Logical Links</span>
                   <span style={{ fontSize: 12, color: '#e5e7eb', fontFamily: 'var(--font-mono)' }}>{links.length}</span>
               </div>
            </div>

         </div>
      </div>
    </div>
  );
}
