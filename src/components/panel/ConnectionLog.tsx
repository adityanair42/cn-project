'use client';

import React, { useRef } from 'react';
import { useSimulatorStore } from '@/store/simulator-store';

const levels: Record<string, { symbol: string; color: string }> = {
  info:    { symbol: '›', color: '#3b82f6' },
  warn:    { symbol: '!', color: '#f59e0b' },
  error:   { symbol: '×', color: '#ef4444' },
  success: { symbol: '✓', color: '#22c55e' },
};

export function ConnectionLog() {
  const logs = useSimulatorStore((s) => s.logs);
  const clearLogs = useSimulatorStore((s) => s.clearLogs);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between" style={{ padding: '10px 16px', borderBottom: '1px solid #1e2030' }}>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Event Log</span>
          <span style={{ fontSize: 11, color: '#4b5563', fontFamily: 'var(--font-mono)' }}>{logs.length}</span>
        </div>
        <button onClick={clearLogs} style={{ fontSize: 11, color: '#4b5563', background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}
          className="hover:!text-red-400 transition-colors">
          Clear
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin" style={{ padding: 8 }}>
        {logs.length === 0 ? (
          <div className="flex items-center justify-center" style={{ height: 80, fontSize: 12, color: '#2a2d3e' }}>No events yet</div>
        ) : (
          logs.map((log) => {
            const lv = levels[log.level] || levels.info;
            const t = new Date(log.timestamp);
            const ts = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}.${String(t.getMilliseconds()).padStart(3, '0')}`;
            return (
              <div key={log.id} className="flex items-start gap-2 transition-colors" style={{ padding: '4px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'var(--font-mono)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1d28')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <span style={{ color: lv.color, flexShrink: 0, width: 12, textAlign: 'center', fontWeight: 700 }}>{lv.symbol}</span>
                <span style={{ color: '#4b5563', flexShrink: 0 }}>{ts}</span>
                <span style={{ color: '#9ca3af', wordBreak: 'break-all' }}>{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
