'use client';

import React from 'react';
import { useSimulatorStore } from '@/store/simulator-store';
import { PacketTable } from './PacketTable';
import { TelemetryCharts } from './TelemetryCharts';
import { ConnectionLog } from './ConnectionLog';

const tabs = [
  { id: 'packets' as const, label: 'Packets', color: '#3b82f6' },
  { id: 'telemetry' as const, label: 'Telemetry', color: '#22c55e' },
  { id: 'logs' as const, label: 'Logs', color: '#f59e0b' },
];

export function InspectorPanel() {
  const inspectorTab = useSimulatorStore((s) => s.inspectorTab);
  const setInspectorTab = useSimulatorStore((s) => s.setInspectorTab);
  const selectedNodeId = useSimulatorStore((s) => s.selectedNodeId);
  const nodes = useSimulatorStore((s) => s.nodes);
  const selectedNode = selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) : null;

  return (
    <div className="flex flex-col h-full" style={{ background: '#141720', borderLeft: '1px solid #1e2030' }}>
      {selectedNode && (
        <div style={{ padding: '12px 16px', background: '#1a1d28', borderBottom: '1px solid #1e2030' }}>
          <div className="flex items-center gap-2 mb-2">
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb' }}>{selectedNode.label}</span>
            <span style={{ fontSize: 11, color: '#4b5563', fontFamily: 'var(--font-mono)' }}>
              {selectedNode.type}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { val: selectedNode.metrics.packetsSent, label: 'Sent', color: '#3b82f6' },
              { val: selectedNode.metrics.packetsReceived, label: 'Recv', color: '#22c55e' },
              { val: selectedNode.metrics.packetsDropped, label: 'Drop', color: '#ef4444' },
              { val: `${selectedNode.metrics.avgLatencyMs.toFixed(0)}ms`, label: 'RTT', color: '#f59e0b' },
            ].map((m) => (
              <div key={m.label} className="text-center" style={{ padding: '4px 0' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: m.color }}>{m.val}</div>
                <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex" style={{ borderBottom: '1px solid #1e2030' }}>
        {tabs.map((tab) => {
          const active = inspectorTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setInspectorTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 transition-all"
              style={{
                padding: '10px 12px',
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: active ? '#e5e7eb' : '#4b5563',
                background: active ? '#1a1d28' : 'transparent',
                borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
              }}
            >
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: active ? tab.color : '#2a2d3e',
                transition: 'background 0.2s',
              }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden">
        {inspectorTab === 'packets' && <PacketTable />}
        {inspectorTab === 'telemetry' && <TelemetryCharts />}
        {inspectorTab === 'logs' && <ConnectionLog />}
      </div>
    </div>
  );
}
