'use client';

import React, { useEffect } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { NetworkCanvas } from '@/components/canvas/NetworkCanvas';
import { InspectorPanel } from '@/components/panel/InspectorPanel';
import { BottomPanel } from '@/components/panel/BottomPanel';
import { Toolbar } from '@/components/controls/Toolbar';
import { useSimulatorStore } from '@/store/simulator-store';

export default function SimulatorPage() {
  const { nodes, addNode, addLink, animatedPackets } = useSimulatorStore();

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
      <div className="flex-1 w-full" style={{ minHeight: 0 }}>
        <PanelGroup orientation="horizontal">
          {/* LEFT SECTION (Canvas + Bottom Panel) */}
          <Panel defaultSize={75} minSize={50}>
            <PanelGroup orientation="vertical">
              {/* TOP: CANVAS */}
              <Panel defaultSize={80} minSize={40} className="relative" style={{ background: '#0d0f14' }}>
                <NetworkCanvas />
              </Panel>

              {/* VERTICAL DRAGGER */}
              <PanelResizeHandle className="flex items-center justify-center transition-colors" style={{ height: 6, background: '#1e2030', cursor: 'row-resize', borderTop: '1px solid #141720', borderBottom: '1px solid #141720' }}>
                <div style={{ width: 40, height: 2, background: '#4b5563', borderRadius: 2 }} />
              </PanelResizeHandle>

              {/* BOTTOM: TELEMETRY/STATUS */}
              <Panel defaultSize={20} minSize={10} style={{ minHeight: 80, overflow: 'hidden' }}>
                <BottomPanel />
              </Panel>
            </PanelGroup>
          </Panel>

          {/* HORIZONTAL DRAGGER */}
          <PanelResizeHandle className="flex items-center justify-center transition-colors hover:bg-[#2a2d3e]" style={{ width: 6, background: '#1e2030', cursor: 'col-resize', borderLeft: '1px solid #141720', borderRight: '1px solid #141720' }}>
            <div style={{ height: 40, width: 2, background: '#4b5563', borderRadius: 2 }} />
          </PanelResizeHandle>

          {/* RIGHT SECTION (Inspector) */}
          <Panel defaultSize={25} minSize={15} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <InspectorPanel />
          </Panel>

        </PanelGroup>
      </div>
    </div>
  );
}
