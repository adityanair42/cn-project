'use client';

import React, { useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Connection, type Node, type Edge,
  BackgroundVariant, Panel,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSimulatorStore } from '@/store/simulator-store';
import { SimulatorNode } from './SimulatorNode';
import { PacketEdge } from './PacketEdge';

const nodeTypes = { simulator: SimulatorNode };
const edgeTypes = { packet: PacketEdge };

export function NetworkCanvas() {
  const {
    nodes: simNodes, links: simLinks, selectedNodeId,
    addNode, addLink, updateNodePosition, selectNode, animatedPackets,
  } = useSimulatorStore();

  const rfNodes: Node[] = useMemo(() => simNodes.map((n) => ({
    id: n.id, type: 'simulator',
    position: { x: n.x, y: n.y },
    data: { label: n.label, type: n.type, isSelected: n.id === selectedNodeId },
    selected: n.id === selectedNodeId,
    draggable: true,
  })), [simNodes, selectedNodeId]);

  const rfEdges: Edge[] = useMemo(() => simLinks.map((l) => ({
    id: l.id, source: l.source, target: l.target, type: 'packet',
  })), [simLinks, animatedPackets]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    for (const c of changes) {
      if (c.type === 'position' && c.position && c.id) updateNodePosition(c.id, c.position.x, c.position.y);
    }
  }, [updateNodePosition]);

  const onConnect = useCallback((params: Connection) => {
    if (params.source && params.target) addLink(params.source, params.target);
  }, [addLink]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => selectNode(node.id), [selectNode]);
  const onPaneClick = useCallback(() => selectNode(null), [selectNode]);

  const onPaneDoubleClick = useCallback((event: React.MouseEvent) => {
    const el = event.target as HTMLElement;
    const rect = el.getBoundingClientRect();
    addNode(event.clientX - rect.left, event.clientY - rect.top);
  }, [addNode]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={rfNodes} edges={rfEdges}
        onNodesChange={onNodesChange} onConnect={onConnect}
        onNodeClick={onNodeClick} onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        fitView proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
        defaultEdgeOptions={{ type: 'packet' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#1e203010" />
        <Controls
          className="!bg-[#141720] !border-[#252a3a] !rounded-lg [&>button]:!bg-[#1a1e2e] [&>button]:!border-[#252a3a] [&>button]:!text-[#4b5563] [&>button:hover]:!bg-[#252a3a] [&>button:hover]:!text-[#9ca3af]"
          showInteractive={false}
        />
        <MiniMap className="!bg-[#0f1117] !border-[#252a3a] !rounded-lg" nodeColor="#4285f4" maskColor="#0a0c10cc" />
        <Panel position="bottom-center">
          <div style={{ fontSize: 11, color: '#3a3f52', fontFamily: 'var(--font-mono)', background: '#0a0c10cc', padding: '4px 14px', borderRadius: 20, border: '1px solid #1e203050' }}>
            double-click to add · drag handles to connect
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
