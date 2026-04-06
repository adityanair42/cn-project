// =============================================================================
// Topology Manager — Graph-based node/link management
// =============================================================================

import { v4 as uuidv4 } from 'uuid';
import type { SimNode, SimLink, NodeMetrics } from '../protocol/types';

function createEmptyMetrics(nodeId: string): NodeMetrics {
  return {
    nodeId,
    packetsSent: 0,
    packetsReceived: 0,
    packetsDropped: 0,
    packetsRetransmitted: 0,
    bytesTransferred: 0,
    avgLatencyMs: 0,
    maxLatencyMs: 0,
    minLatencyMs: Infinity,
    throughputBps: 0,
    checksumFailures: 0,
  };
}

// Auto-gen names: Node-A, Node-B, ..., Node-Z, Node-AA, ...
const NODE_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
let nodeCounter = 0;

function generateNodeLabel(): string {
  const idx = nodeCounter++;
  if (idx < 26) return `Node-${NODE_NAMES[idx]}`;
  const first = NODE_NAMES[Math.floor(idx / 26) - 1];
  const second = NODE_NAMES[idx % 26];
  return `Node-${first}${second}`;
}

export function resetNodeCounter(): void {
  nodeCounter = 0;
}

export function createNode(
  x: number,
  y: number,
  type: SimNode['type'] = 'endpoint',
): SimNode {
  const id = uuidv4().slice(0, 8);
  const label = generateNodeLabel();
  return {
    id,
    label,
    x,
    y,
    type,
    metrics: createEmptyMetrics(id),
  };
}

export function createLink(
  sourceId: string,
  targetId: string,
  latencyMs: number = 50,
  packetLossPercent: number = 0,
): SimLink {
  return {
    id: `${sourceId}-${targetId}`,
    source: sourceId,
    target: targetId,
    latencyMs,
    packetLossPercent,
  };
}

/**
 * Find shortest path between two nodes using BFS (for mesh routing)
 */
export function findPath(
  nodes: SimNode[],
  links: SimLink[],
  sourceId: string,
  targetId: string,
): string[] | null {
  // Build adjacency list
  const adj: Map<string, string[]> = new Map();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const link of links) {
    adj.get(link.source)?.push(link.target);
    adj.get(link.target)?.push(link.source);
  }

  // BFS
  const visited = new Set<string>();
  const queue: string[][] = [[sourceId]];
  visited.add(sourceId);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const current = path[path.length - 1];

    if (current === targetId) return path;

    for (const neighbor of (adj.get(current) || [])) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }

  return null; // No path found
}

/**
 * Get the link between two directly connected nodes
 */
export function getLinkBetween(
  links: SimLink[],
  nodeA: string,
  nodeB: string,
): SimLink | undefined {
  return links.find(
    (l) =>
      (l.source === nodeA && l.target === nodeB) ||
      (l.source === nodeB && l.target === nodeA),
  );
}
