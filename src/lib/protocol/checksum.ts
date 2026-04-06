export function calculateChecksum(data: string, len: number): number {
  let checksum = 0;
  for (let i = 0; i < len; i++) {
    checksum ^= data.charCodeAt(i);
  }
  return checksum & 0xFFFF;
}

export function verifyChecksum(payload: string, payloadLen: number, expectedChecksum: number): boolean {
  return calculateChecksum(payload, payloadLen) === expectedChecksum;
}
