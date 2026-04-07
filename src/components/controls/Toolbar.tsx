'use client';

import React, { useState } from 'react';
import { useSimulatorStore } from '@/store/simulator-store';
import type { ProtocolMode } from '@/lib/protocol/types';

const protocols: { id: ProtocolMode; label: string; color: string }[] = [
  { id: 'rudp', label: 'RUDP', color: '#3b82f6' },
  { id: 'tcp', label: 'TCP', color: '#22c55e' },
  { id: 'udp', label: 'UDP', color: '#f59e0b' },
];

export function Toolbar() {
  const {
    nodes, activeProtocol, setProtocol, addNode, sendData,
    isRunning, startAutoSend, stopAutoSend,
    config, updateConfig, selectedNodeId, packetLog, resetSimulation
  } = useSimulatorStore();

  const [showSend, setShowSend] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const [sendTarget, setSendTarget] = useState('');
  const [payloadSize, setPayloadSize] = useState(128);
  const sendPayload = 'X'.repeat(payloadSize);

  const handleAddNode = () => addNode(100 + Math.random() * 400, 100 + Math.random() * 300);

  const handleSend = () => {
    if (!selectedNodeId || !sendTarget) return;
    sendData(selectedNodeId, sendTarget, sendPayload);
    setShowSend(false);
  };

  const targets = nodes.filter((n) => n.id !== selectedNodeId);

  const getCongestionLevel = () => Math.min(100, Math.round((config.packetLossPercent / 50) * 100));
  
  const handleCongestionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value); // 0 to 100
    updateConfig({
      packetLossPercent: val * 0.5, // 0 to 50%
      latencyMs: 10 + (val * 4.9), // 10ms to 500ms
      jitterMs: 2 + (val * 0.98),  // 2ms to 100ms
    });
  };

  return (
    <div className="relative flex items-center gap-3" style={{ padding: '10px 20px', background: '#0f1117', borderBottom: '1px solid #1e2030' }}>
      <div className="flex items-center gap-3 pr-5 mr-3" style={{ borderRight: '1px solid #1e2030' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #3b82f6, #2dd4bf)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb' }}>RUDP Simulator</div>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#4b5563' }}>Protocol Lab</div>
        </div>
      </div>

      <button onClick={handleAddNode} className="flex items-center gap-1.5 transition-colors" style={{ padding: '7px 12px', borderRadius: 8, background: '#1a1d28', border: '1px solid #252836', fontSize: 12, fontWeight: 600, color: '#9ca3af', cursor: 'pointer' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Add Node
      </button>

      <div className="flex" style={{ borderRadius: 8, border: '1px solid #252836', overflow: 'hidden' }}>
        {protocols.map((p) => (
          <button key={p.id} onClick={() => setProtocol(p.id)} style={{
            padding: '7px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
            color: activeProtocol === p.id ? p.color : '#4b5563',
            background: activeProtocol === p.id ? '#1a1d28' : 'transparent',
            transition: 'all 0.15s',
          }}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="relative z-50">
        <button onClick={() => setShowSend(!showSend)} disabled={!selectedNodeId} className="flex items-center gap-1.5" style={{
          padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: selectedNodeId ? 'pointer' : 'not-allowed', border: '1px solid',
          background: selectedNodeId ? '#3b82f612' : '#1a1d28', borderColor: selectedNodeId ? '#3b82f630' : '#252836', color: selectedNodeId ? '#3b82f6' : '#4b5563',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          Send
        </button>

        {showSend && selectedNodeId && (
          <div className="absolute top-full mt-2 left-0" style={{ width: 300, background: '#1a1d28', border: '1px solid #252836', borderRadius: 12, padding: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#e5e7eb', marginBottom: 12 }}>
              Send from {nodes.find(n => n.id === selectedNodeId)?.label}
            </div>
            <label style={{ display: 'block', fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 4 }}>Target</label>
            <select value={sendTarget} onChange={(e) => setSendTarget(e.target.value)} style={{ width: '100%', background: '#0f1117', border: '1px solid #252836', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#e5e7eb', marginBottom: 16, outline: 'none' }}>
              <option value="">Select...</option>
              {targets.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <label style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Payload Size</label>
              <span style={{ fontSize: 11, color: '#3b82f6', fontFamily: 'var(--font-mono)' }}>{payloadSize} Bytes</span>
            </div>
            <input type="range" min="1" max="2048" value={payloadSize} onChange={(e) => setPayloadSize(Number(e.target.value))} style={{ width: '100%', marginBottom: 16 }} />

            <div className="flex items-center justify-end">
              <button onClick={handleSend} disabled={!sendTarget} style={{ padding: '7px 20px', borderRadius: 8, background: '#3b82f6', color: 'white', fontSize: 12, fontWeight: 700, border: 'none', cursor: sendTarget ? 'pointer' : 'not-allowed', opacity: sendTarget ? 1 : 0.4 }}>
                Send →
              </button>
            </div>
          </div>
        )}
      </div>

      <button onClick={isRunning ? stopAutoSend : startAutoSend} className="flex items-center gap-1.5 transition-colors hover:brightness-125" style={{
        padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid',
        background: isRunning ? '#ef444412' : '#1a1d28', borderColor: isRunning ? '#ef444430' : '#252836', color: isRunning ? '#ef4444' : '#9ca3af',
      }}>
        {isRunning ? <><div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} /> Stop Auto</> : <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21" /></svg> Start Auto-Data</>}
      </button>

      <button onClick={resetSimulation} className="flex items-center gap-1.5 transition-colors hover:bg-[#ef444415] hover:border-[#ef444430] hover:text-[#ef4444]" style={{
        padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid #252836', background: '#1a1d28', color: '#6b7280'
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
        Clear Telemetry
      </button>

      <div className="flex-1" />

      <div className="relative z-40">
        <button onClick={() => setShowSettings(!showSettings)} style={{ padding: 7, borderRadius: 8, background: '#1a1d28', border: '1px solid #252836', cursor: 'pointer', color: '#6b7280', display: 'flex' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" /></svg>
        </button>

        {showSettings && (
          <div className="absolute top-full mt-2 right-0" style={{ width: 340, background: '#1a1d28', border: '1px solid #252836', borderRadius: 12, padding: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', marginBottom: 14 }}>Simulation Engine</div>
            

            <div style={{ marginBottom: 20, padding: 12, background: '#0f1117', borderRadius: 8, border: '1px solid #1e2030' }}>
              <div className="flex justify-between items-center" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#e5e7eb', fontWeight: 600, letterSpacing: '0.04em' }}>Network Congestion / Noise</span>
                <span style={{ fontSize: 12, color: getCongestionLevel() > 50 ? '#ef4444' : '#3b82f6', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{getCongestionLevel()}%</span>
              </div>
              <input type="range" min="0" max="100" value={getCongestionLevel()} onChange={handleCongestionChange} style={{ width: '100%' }} />
              
              <div className="flex justify-between mt-3 gap-2">
                 <div className="flex-1 text-center" style={{ background: '#1a1d28', padding: '6px', borderRadius: 6, border: '1px solid #252836' }}>
                    <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>Latency</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>{config.latencyMs.toFixed(0)}ms</div>
                 </div>
                 <div className="flex-1 text-center" style={{ background: '#1a1d28', padding: '6px', borderRadius: 6, border: '1px solid #252836' }}>
                    <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>Jitter</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'var(--font-mono)' }}>±{config.jitterMs.toFixed(0)}ms</div>
                 </div>
                 <div className="flex-1 text-center" style={{ background: '#1a1d28', padding: '6px', borderRadius: 6, border: '1px solid #252836' }}>
                    <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', fontWeight: 700 }}>Loss</div>
                    <div style={{ fontSize: 10, color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{config.packetLossPercent.toFixed(1)}%</div>
                 </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #252836', paddingTop: 16 }}>
              <div style={{ fontSize: 11, color: '#e5e7eb', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 10 }}>Auto-Send Load Generation</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 10, color: '#4b5563', display: 'block', marginBottom: 4, fontWeight: 600 }}>Interval Rate (ms)</label>
                  <input type="number" min="100" max="10000" step="100" value={config.autoSendInterval} onChange={(e) => updateConfig({ autoSendInterval: Number(e.target.value) })} style={{ width: '100%', background: '#0f1117', border: '1px solid #252836', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: '#e5e7eb', outline: 'none' }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: '#4b5563', display: 'block', marginBottom: 4, fontWeight: 600 }}>Min Payload (B)</label>
                  <input type="number" min="1" max="8192" step="64" value={config.autoPayloadSize} onChange={(e) => updateConfig({ autoPayloadSize: Number(e.target.value) })} style={{ width: '100%', background: '#0f1117', border: '1px solid #252836', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: '#e5e7eb', outline: 'none' }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
