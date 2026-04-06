'use client';

import React from 'react';
import { useSimulatorStore } from '@/store/simulator-store';
import { flagsToString } from '@/lib/protocol/rudp-engine';

const directionStyles: Record<string, { bg: string; text: string; label: string }> = {
  sent:       { bg: '#3b82f618', text: '#3b82f6', label: 'SENT' },
  received:   { bg: '#22c55e18', text: '#22c55e', label: 'RECV' },
  dropped:    { bg: '#ef444418', text: '#ef4444', label: 'DROP' },
  retransmit: { bg: '#f59e0b18', text: '#f59e0b', label: 'RETX' },
};

function flagColor(flags: number): string {
  const s = flagsToString(flags);
  if (s.includes('SYN') && s.includes('ACK')) return '#22c55e';
  if (s.includes('SYN')) return '#3b82f6';
  if (s.includes('DATA')) return '#a78bfa';
  if (s.includes('ACK')) return '#2dd4bf';
  if (s.includes('FIN')) return '#ef4444';
  return '#4b5563';
}

export function PacketTable() {
  const packetLog = useSimulatorStore((s) => s.packetLog);
  const nodes = useSimulatorStore((s) => s.nodes);
  const clearPacketLog = useSimulatorStore((s) => s.clearPacketLog);
  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label || id.slice(0, 6);
  const t0 = packetLog.length > 0 ? packetLog[packetLog.length - 1].timestamp : 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between" style={{ padding: '10px 16px', borderBottom: '1px solid #1e2030' }}>
        <div className="flex items-center gap-2">
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#3b82f6' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Packet Capture
          </span>
          <span style={{ fontSize: 11, color: '#4b5563', fontFamily: 'var(--font-mono)' }}>{packetLog.length}</span>
        </div>
        <button onClick={clearPacketLog} style={{ fontSize: 11, color: '#4b5563', padding: '2px 8px', borderRadius: 4, background: 'transparent', border: 'none', cursor: 'pointer' }}
          className="hover:!text-red-400 transition-colors">
          Clear
        </button>
      </div>

      <div className="grid grid-cols-[46px_68px_56px_38px_42px_1fr] gap-1" style={{ padding: '6px 16px', borderBottom: '1px solid #1a1d28' }}>
        {['Time', 'Route', 'Flags', 'Seq', 'Len', 'Status'].map((h) => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {packetLog.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 120, fontSize: 12, color: '#2a2d3e' }}>No packets captured yet</div>
        ) : (
          packetLog.map((pkt, idx) => {
            const ds = directionStyles[pkt.direction];
            return (
              <div
                key={pkt.id}
                className="grid grid-cols-[46px_68px_56px_38px_42px_1fr] gap-1 transition-colors cursor-pointer"
                style={{
                  padding: '5px 16px',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  borderBottom: '1px solid #1a1d2800',
                  background: pkt.direction === 'dropped' ? '#ef44440a' : pkt.direction === 'retransmit' ? '#f59e0b0a' : 'transparent',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1d28')}
                onMouseLeave={(e) => (e.currentTarget.style.background = pkt.direction === 'dropped' ? '#ef44440a' : pkt.direction === 'retransmit' ? '#f59e0b0a' : 'transparent')}
              >
                <span style={{ color: '#4b5563' }}>{((pkt.timestamp - t0) / 1000).toFixed(2)}</span>
                <span className="truncate" style={{ color: '#9ca3af' }}>{nodeLabel(pkt.sourceNodeId)}→{nodeLabel(pkt.targetNodeId)}</span>
                <span style={{ color: flagColor(pkt.flags) }}>{flagsToString(pkt.flags)}</span>
                <span style={{ color: '#6b7280' }}>{pkt.seqNum || '—'}</span>
                <span style={{ color: '#6b7280' }}>{pkt.payloadLen || '—'}</span>
                {ds && (
                  <span style={{ background: ds.bg, color: ds.text, fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3, display: 'inline-block', width: 'fit-content' }}>
                    {ds.label}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
