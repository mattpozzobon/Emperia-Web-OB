/**
 * Minimal PacketWriter for building binary Emperia/Tibia data files.
 */
export default class PacketWriter {
  private chunks: Uint8Array[] = [];
  private current: Uint8Array;
  private pos = 0;

  constructor(initialSize = 4096) {
    this.current = new Uint8Array(initialSize);
  }

  private ensure(bytes: number): void {
    if (this.pos + bytes <= this.current.length) return;
    // Flush current chunk and allocate a bigger one
    this.chunks.push(this.current.slice(0, this.pos));
    const newSize = Math.max(this.current.length * 2, bytes + 1024);
    this.current = new Uint8Array(newSize);
    this.pos = 0;
  }

  writeUInt8(v: number): void {
    this.ensure(1);
    this.current[this.pos++] = v & 0xFF;
  }

  writeInt8(v: number): void {
    this.ensure(1);
    this.current[this.pos++] = v & 0xFF;
  }

  writeUInt16(v: number): void {
    this.ensure(2);
    this.current[this.pos++] = v & 0xFF;
    this.current[this.pos++] = (v >> 8) & 0xFF;
  }

  writeUInt32(v: number): void {
    this.ensure(4);
    this.current[this.pos++] = v & 0xFF;
    this.current[this.pos++] = (v >> 8) & 0xFF;
    this.current[this.pos++] = (v >> 16) & 0xFF;
    this.current[this.pos++] = (v >> 24) & 0xFF;
  }

  writeBytes(data: Uint8Array): void {
    this.ensure(data.length);
    this.current.set(data, this.pos);
    this.pos += data.length;
  }

  writeString(s: string): void {
    const encoded = new TextEncoder().encode(s);
    this.writeUInt16(encoded.length);
    this.ensure(encoded.length);
    this.current.set(encoded, this.pos);
    this.pos += encoded.length;
  }

  /** Get the complete buffer as a single ArrayBuffer */
  toArrayBuffer(): ArrayBuffer {
    // Flush remaining
    this.chunks.push(this.current.slice(0, this.pos));

    // Calculate total size
    const totalSize = this.chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    // Reset so writer can be reused
    this.chunks = [];
    this.current = new Uint8Array(4096);
    this.pos = 0;

    return result.buffer;
  }
}
