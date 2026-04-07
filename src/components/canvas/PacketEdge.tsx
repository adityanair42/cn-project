'use client';

import React, { useEffect, useState } from 'react';
import { type EdgeProps } from '@xyflow/react';
import { useSimulatorStore } from '@/store/simulator-store';
import { FLAG_SYN, FLAG_ACK, FLAG_DATA } from '@/lib/protocol/types';

const NODE_HALF = 20;

const packetColors: Record<string, string> = {
  data: '#a78bfa', synack: '#2ec97a', syn: '#4285f4', ack: '#2dd4bf', other: '#f59e0b',
};

function getColor(flags: number): string {
  if (flags & FLAG_DATA) return packetColors.data;
  if ((flags & FLAG_SYN) && (flags & FLAG_ACK)) return packetColors.synack;
  if (flags & FLAG_SYN) return packetColors.syn;
  if (flags & FLAG_ACK) return packetColors.ack;
  return packetColors.other;
}

function AnimatedDot({ sx, sy, tx, ty, pkt }: { sx: number; sy: number; tx: number; ty: number; pkt: { id: string; startTime: number; duration: number; flags: number } }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf: number;
    const tick = () => {
      const p = Math.min(1, (Date.now() - pkt.startTime) / pkt.duration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pkt.startTime, pkt.duration]);

  const x = sx + (tx - sx) * progress;
  const y = sy + (ty - sy) * progress;
  const color = getColor(pkt.flags);

  return <circle cx={x} cy={y} r={3.5} fill={color} style={{ filter: `drop-shadow(0 0 3px ${color})` }} />;
}

export function PacketEdge({ sourceX, sourceY, targetX, targetY, source, target }: EdgeProps) {
  const animatedPackets = useSimulatorStore((s) => s.animatedPackets);

  const cx1 = sourceX;
  const cy1 = sourceY - NODE_HALF;
  const cx2 = targetX;
  const cy2 = targetY + NODE_HALF;

  const mx = (cx1 + cx2) / 2;
  const my = (cy1 + cy2) / 2;
  const dx = cx2 - cx1;
  const dy = cy2 - cy1;
  const len = Math.sqrt(dx * dx + dy * dy);

  let lx1 = cx1, ly1 = cy1, lx2 = cx2, ly2 = cy2;
  if (len > 0) {
    const nx = dx / len;
    const ny = dy / len;
    const clipRadius = 14;
    lx1 = cx1 + nx * clipRadius;
    ly1 = cy1 + ny * clipRadius;
    lx2 = cx2 - nx * clipRadius;
    ly2 = cy2 - ny * clipRadius;
  }

  const active = animatedPackets.filter(
    (p) => (p.sourceNodeId === source && p.targetNodeId === target) || (p.sourceNodeId === target && p.targetNodeId === source),
  );

  return (
    <>
      <line x1={lx1} y1={ly1} x2={lx2} y2={ly2} stroke={active.length > 0 ? '#4285f440' : '#252a3a'} strokeWidth={active.length > 0 ? 1.5 : 1} style={{ transition: 'stroke 0.3s' }} />
      {active.map((pkt) => {
        const reversed = pkt.sourceNodeId === target;
        return <AnimatedDot key={pkt.id} sx={reversed ? cx2 : cx1} sy={reversed ? cy2 : cy1} tx={reversed ? cx1 : cx2} ty={reversed ? cy1 : cy2} pkt={pkt} />;
      })}
    </>
  );
}
