'use client';

import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

interface SimulatorNodeData {
  label: string;
  type: 'endpoint' | 'router';
  isSelected: boolean;
}

function SimulatorNodeComponent({ data, selected }: NodeProps & { data: SimulatorNodeData }) {
  const nodeData = data as unknown as SimulatorNodeData;
  const isEndpoint = nodeData.type === 'endpoint';
  const isActive = selected || nodeData.isSelected;
  const accent = isEndpoint ? '#4285f4' : '#2ec97a';

  // Absolute positioning exactly in the center of the node, invisible
  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 20,
    height: 20,
    minWidth: 0,
    minHeight: 0,
    background: 'transparent',
    border: 'none',
    zIndex: 10,
  };

  return (
    <div className="group relative flex flex-col items-center justify-center" style={{ width: 40, height: 40 }}>
      {/* Invisible Handles at absolute center for straight-line perfect connections */}
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <Handle type="source" position={Position.Right} id="right" style={handleStyle} />
      <Handle type="target" position={Position.Left} id="left" style={handleStyle} />

      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: isActive ? `${accent}18` : '#1a1e2e',
        border: `1.5px solid ${isActive ? accent : '#252a3a'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'grab', transition: 'all 0.2s', position: 'relative', zIndex: 5,
        boxShadow: isActive ? `0 0 10px ${accent}25` : 'none',
      }} className="active:cursor-grabbing">
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: isActive ? accent : '#3a3f52',
          transition: 'background 0.2s',
        }} />
      </div>

      <div style={{
        position: 'absolute', top: 42,
        fontSize: 9, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em', whiteSpace: 'nowrap', transition: 'opacity 0.2s',
        opacity: isActive ? 0.8 : 0, color: isActive ? accent : '#6b7280',
      }} className="group-hover:!opacity-50">
        {nodeData.label}
      </div>
    </div>
  );
}

export const SimulatorNode = memo(SimulatorNodeComponent);
