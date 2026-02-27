/**
 * Minimal PacketReader for parsing binary Emperia/Tibia data files.
 * Standalone — no game dependencies.
 */
export default class PacketReader {
  buffer: Uint8Array;
  index: number = 0;

  constructor(buffer: ArrayBuffer | Uint8Array) {
    this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  }

  slice(start: number, end: number): PacketReader {
    return new PacketReader(this.buffer.slice(start, end));
  }

  readable(): boolean {
    return this.index < this.buffer.length;
  }

  skip(n: number): void {
    this.index += n;
  }

  readUInt8(): number {
    return this.buffer[this.index++];
  }

  readInt8(): number {
    const value = this.buffer[this.index++];
    return value << 24 >> 24;
  }

  readUInt16(): number {
    return this.buffer[this.index++] + (this.buffer[this.index++] << 8);
  }

  readUInt32(): number {
    return (
      this.buffer[this.index++] +
      (this.buffer[this.index++] << 8) +
      (this.buffer[this.index++] << 16) +
      (this.buffer[this.index++] << 24)
    ) >>> 0;
  }

  readString(): string {
    const length = this.readUInt16();
    if (length === 0) return "";
    const str = new TextDecoder("utf-8").decode(
      this.buffer.slice(this.index, this.index + length)
    );
    this.index += length;
    return str;
  }

  readRGB(): number {
    return (
      this.buffer[this.index++] +
      (this.buffer[this.index++] << 8) +
      (this.buffer[this.index++] << 16)
    );
  }

  readLight(): { level: number; color: number } {
    return { level: this.readUInt16(), color: this.readUInt16() };
  }

  readAnimationLength(): { min: number; max: number } {
    return { min: this.readUInt32(), max: this.readUInt32() };
  }
}
