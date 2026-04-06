'use client';

import React, { useEffect } from 'react';
import { NetworkCanvas } from '@/components/canvas/NetworkCanvas';
import { InspectorPanel } from '@/components/panel/InspectorPanel';
import { BottomPanel } from '@/components/panel/BottomPanel';
import { Toolbar } from '@/components/controls/Toolbar';
import { useSimulatorStore } from '@/store/simulator-store';

export default function SimulatorPage() {
  const { nodes, links, addNode, addLink, packetLog, isRunning, animatedPackets } = useSimulatorStore();

  useEffect(() => {
    if (nodes.length === 0) {
      const a = addNode(200, 150);
      const b = addNode(500, 150);
      const c = addNode(350, 300);
      const d = addNode(650, 300);
      setTimeout(() => {
        addLink(a.id, b.id);
        addLink(b.id, c.id);
        addLink(a.id, c.id);
        addLink(b.id, d.id);
        addLink(c.id, d.id);
      }, 50);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (animatedPackets.length === 0) return;
    let id: number;
    const tick = () => { id = requestAnimationFrame(tick); };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [animatedPackets.length]);

  return (
    <div className="flex flex-col h-screen w-screen" style={{ background: '#0a0c10' }}>
      <Toolbar />
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex flex-col flex-1" style={{ minWidth: 0 }}>
          <div className="flex-1 relative" style={{ background: '#0d0f14' }}>
            <NetworkCanvas />
          </div>
          <BottomPanel />
        </div>
        <div style={{ width: 380, flexShrink: 0 }}>
          <InspectorPanel />
        </div>
      </div>
    </div>
  );
}
