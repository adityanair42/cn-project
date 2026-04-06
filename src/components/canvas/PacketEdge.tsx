'use client';

import React from 'react';
import { type EdgeProps, getStraightPath } from '@xyflow/react';
import { useSimulatorStore } from '@/store/simulator-store';
import { FLAG_SYN, FLAG_ACK, FLAG_DATA } from '@/lib/protocol/types';

const packetColors: Record<string, string> = {
  data: '#a78bfa',
  synack: '#2ec97a',
  syn: '#4285f4',
  ack: '#2dd4bf',
  other: '#f59e0b',
};

function getColor(flags: number): string {
  if (flags & FLAG_DATA) return packetColors.data;
  if ((flags & FLAG_SYN) && (flags & FLAG_ACK)) return packetColors.synack;
  if (flags & FLAG_SYN) return packetColors.syn;
  if (flags & FLAG_ACK) return packetColors.ack;
  return packetColors.other;
}

export function PacketEdge({ sourceX, sourceY, targetX, targetY, source, target }: EdgeProps) {
  const animatedPackets = useSimulatorStore((s) => s.animatedPackets);
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });

  const active = animatedPackets.filter(
    (p) => (p.sourceNodeId === source && p.targetNodeId === target) || (p.sourceNodeId === target && p.targetNodeId === source),
  );

  return (
    <>
      <path d={path} fill="none" stroke={active.length > 0 ? '#4285f440' : '#252a3a'} strokeWidth={active.length > 0 ? 1.5 : 1} style={{ transition: 'stroke 0.3s' }} />
      {active.map((pkt) => (
        <circle key={pkt.id} r={3} fill={getColor(pkt.flags)}>
          <animateMotion dur={`${pkt.duration}ms`} fill="freeze" path={path} keyPoints={pkt.sourceNodeId === target ? '1;0' : '0;1'} keyTimes="0;1" />
        </circle>
      ))}
    </>
  );
}
