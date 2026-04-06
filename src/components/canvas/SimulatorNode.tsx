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

  const handleStyle: React.CSSProperties = {
    width: 6, height: 6, minWidth: 0, minHeight: 0,
    background: 'transparent', border: 'none',
    top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  };

  return (
    <div className="group relative flex flex-col items-center">
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, top: '50%' }} />
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, top: '50%' }} />
      <Handle type="source" position={Position.Right} id="right" style={{ ...handleStyle, top: '50%' }} />
      <Handle type="target" position={Position.Left} id="left" style={{ ...handleStyle, top: '50%' }} />

      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: isActive ? `${accent}18` : '#1a1e2e',
        border: `1.5px solid ${isActive ? accent : '#252a3a'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'grab', transition: 'all 0.2s',
        boxShadow: isActive ? `0 0 10px ${accent}25` : 'none',
      }} className="active:cursor-grabbing">
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: isActive ? accent : '#3a3f52',
          transition: 'background 0.2s',
        }} />
      </div>

      <div style={{
        marginTop: 5, fontSize: 9, fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em', whiteSpace: 'nowrap', transition: 'opacity 0.2s',
        opacity: isActive ? 0.8 : 0, color: isActive ? accent : '#6b7280',
      }} className="group-hover:!opacity-50">
        {nodeData.label}
      </div>
    </div>
  );
}

export const SimulatorNode = memo(SimulatorNodeComponent);
