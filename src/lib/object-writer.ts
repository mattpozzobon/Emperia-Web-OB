/**
 * Compiles ObjectData back to .eobj binary format.
 * Inverse of object-parser.ts — writes Emperia header + flags + frame groups.
 */
import PacketWriter from './packet-writer';
import { EMPERIA_MAGIC, EMPERIA_HEADER_SIZE, EmperiaFileType } from './emperia-format';
import type { ObjectData, ThingType, ThingFlags, FrameGroup } from './types';

const ATTR = {
  ThingAttrGround: 0,
  ThingAttrGroundBorder: 1,
  ThingAttrOnBottom: 2,
  ThingAttrOnTop: 3,
  ThingAttrContainer: 4,
  ThingAttrStackable: 5,
  ThingAttrForceUse: 6,
  ThingAttrMultiUse: 7,
  ThingAttrWritable: 8,
  ThingAttrWritableOnce: 9,
  ThingAttrFluidContainer: 10,
  ThingAttrSplash: 11,
  ThingAttrNotWalkable: 12,
  ThingAttrNotMoveable: 13,
  ThingAttrBlockProjectile: 14,
  ThingAttrNotPathable: 15,
  ThingAttrPickupable: 16,
  ThingAttrHangable: 17,
  ThingAttrHookSouth: 18,
  ThingAttrHookEast: 19,
  ThingAttrRotateable: 20,
  ThingAttrLight: 21,
  ThingAttrDontHide: 22,
  ThingAttrTranslucent: 23,
  ThingAttrDisplacement: 24,
  ThingAttrElevation: 25,
  ThingAttrLyingCorpse: 26,
  ThingAttrAnimateAlways: 27,
  ThingAttrMinimapColor: 28,
  ThingAttrLensHelp: 29,
  ThingAttrFullGround: 30,
  ThingAttrLook: 31,
  ThingAttrCloth: 32,
  ThingAttrMarket: 33,
  ThingAttrUsable: 34,
  ThingAttrWrapable: 35,
  ThingAttrUnwrapable: 36,
  ThingAttrTopEffect: 37,
  ThingAttrNoMoveAnimation: 253,
  ThingAttrChargeable: 254,
  ThingAttrLast: 255,
} as const;

function writeFlags(w: PacketWriter, flags: ThingFlags, version: number): void {
  // Write each flag in the canonical attribute order.
  // For version >= 1000, we need to reverse the mapVersionFlag mapping:
  //   written flag 16 = ThingAttrNoMoveAnimation (253)
  //   written flags > 16 are shifted: writtenFlag = attr + 1

  const writeAttr = (attr: number) => {
    if (version >= 1000) {
      // Inverse of parser's mapVersionFlag for v >= 1000:
      //   parser: raw 16 → 253, raw > 16 → raw - 1
      //   writer: canonical 253 → raw 16, canonical >= 16 → raw canonical + 1
      if (attr === ATTR.ThingAttrNoMoveAnimation) { w.writeUInt8(16); return; }
      if (attr === ATTR.ThingAttrChargeable) { w.writeUInt8(ATTR.ThingAttrChargeable + 1); return; }
      if (attr >= 16) { w.writeUInt8(attr + 1); return; }
    }
    w.writeUInt8(attr);
  };

  if (flags.ground) {
    writeAttr(ATTR.ThingAttrGround);
    w.writeUInt16(flags.groundSpeed ?? 0);
  }
  if (flags.groundBorder) writeAttr(ATTR.ThingAttrGroundBorder);
  if (flags.onBottom) writeAttr(ATTR.ThingAttrOnBottom);
  if (flags.onTop) writeAttr(ATTR.ThingAttrOnTop);
  if (flags.container) writeAttr(ATTR.ThingAttrContainer);
  if (flags.stackable) writeAttr(ATTR.ThingAttrStackable);
  if (flags.forceUse) writeAttr(ATTR.ThingAttrForceUse);
  if (flags.multiUse) writeAttr(ATTR.ThingAttrMultiUse);
  if (flags.writable) {
    writeAttr(ATTR.ThingAttrWritable);
    w.writeUInt16(flags.writableMaxLen ?? 0);
  }
  if (flags.writableOnce) {
    writeAttr(ATTR.ThingAttrWritableOnce);
    w.writeUInt16(flags.writableOnceMaxLen ?? 0);
  }
  if (flags.fluidContainer) writeAttr(ATTR.ThingAttrFluidContainer);
  if (flags.splash) writeAttr(ATTR.ThingAttrSplash);
  if (flags.notWalkable) writeAttr(ATTR.ThingAttrNotWalkable);
  if (flags.notMoveable) writeAttr(ATTR.ThingAttrNotMoveable);
  if (flags.blockProjectile) writeAttr(ATTR.ThingAttrBlockProjectile);
  if (flags.notPathable) writeAttr(ATTR.ThingAttrNotPathable);
  if (flags.pickupable) writeAttr(ATTR.ThingAttrPickupable);
  if (flags.hangable) writeAttr(ATTR.ThingAttrHangable);
  if (flags.hookSouth) writeAttr(ATTR.ThingAttrHookSouth);
  if (flags.hookEast) writeAttr(ATTR.ThingAttrHookEast);
  if (flags.rotateable) writeAttr(ATTR.ThingAttrRotateable);
  if (flags.hasLight) {
    writeAttr(ATTR.ThingAttrLight);
    w.writeUInt16(flags.lightLevel ?? 0);
    w.writeUInt16(flags.lightColor ?? 0);
  }
  if (flags.dontHide) writeAttr(ATTR.ThingAttrDontHide);
  if (flags.translucent) writeAttr(ATTR.ThingAttrTranslucent);
  if (flags.hasDisplacement) {
    writeAttr(ATTR.ThingAttrDisplacement);
    if (version >= 755) {
      w.writeUInt16(flags.displacementX ?? 0);
      w.writeUInt16(flags.displacementY ?? 0);
    }
  }
  if (flags.hasElevation) {
    writeAttr(ATTR.ThingAttrElevation);
    w.writeUInt16(flags.elevation ?? 0);
  }
  if (flags.lyingCorpse) writeAttr(ATTR.ThingAttrLyingCorpse);
  if (flags.animateAlways) writeAttr(ATTR.ThingAttrAnimateAlways);
  if (flags.hasMinimapColor) {
    writeAttr(ATTR.ThingAttrMinimapColor);
    w.writeUInt16(flags.minimapColor ?? 0);
  }
  if (flags.lensHelp != null) {
    writeAttr(ATTR.ThingAttrLensHelp);
    w.writeUInt16(flags.lensHelp);
  }
  if (flags.fullGround) writeAttr(ATTR.ThingAttrFullGround);
  if (flags.look) writeAttr(ATTR.ThingAttrLook);
  if (flags.cloth) {
    writeAttr(ATTR.ThingAttrCloth);
    w.writeUInt16(flags.clothSlot ?? 0);
  }
  if (flags.hasMarket) {
    writeAttr(ATTR.ThingAttrMarket);
    w.writeUInt16(flags.marketCategory ?? 0);
    w.writeUInt16(flags.marketTradeAs ?? 0);
    w.writeUInt16(flags.marketShowAs ?? 0);
    w.writeString(flags.marketName ?? '');
    w.writeUInt16(flags.marketRestrictVocation ?? 0);
    w.writeUInt16(flags.marketRequiredLevel ?? 0);
  }
  if (flags.usable) {
    writeAttr(ATTR.ThingAttrUsable);
    w.writeUInt16(flags.usableActionId ?? 0);
  }
  if (flags.wrapable) writeAttr(ATTR.ThingAttrWrapable);
  if (flags.unwrapable) writeAttr(ATTR.ThingAttrUnwrapable);
  if (flags.topEffect) writeAttr(ATTR.ThingAttrTopEffect);
  if (flags.noMoveAnimation) writeAttr(ATTR.ThingAttrNoMoveAnimation);
  if (flags.chargeable) writeAttr(ATTR.ThingAttrChargeable);

  // Terminator
  w.writeUInt8(ATTR.ThingAttrLast);
}

function writeFrameGroup(w: PacketWriter, fg: FrameGroup, version: number, writeGroupType: boolean): void {
  if (writeGroupType) w.writeUInt8(fg.type);

  w.writeUInt8(fg.width);
  w.writeUInt8(fg.height);

  if (fg.width > 1 || fg.height > 1) {
    w.writeUInt8(Math.max(fg.width, fg.height)); // exact size hint
  }

  w.writeUInt8(fg.layers);
  w.writeUInt8(fg.patternX);
  w.writeUInt8(fg.patternY);
  if (version >= 755) w.writeUInt8(fg.patternZ);
  w.writeUInt8(fg.animationLength);

  if (fg.animationLength > 1 && version >= 1050) {
    w.writeUInt8(fg.asynchronous);
    w.writeUInt32(fg.nLoop);
    w.writeUInt8(fg.start & 0xFF); // writeInt8 via writeUInt8
    for (let i = 0; i < fg.animationLength; i++) {
      const al = fg.animationLengths[i] ?? { min: 100, max: 100 };
      w.writeUInt32(al.min);
      w.writeUInt32(al.max);
    }
  }

  for (const spriteId of fg.sprites) {
    if (version >= 960) w.writeUInt32(spriteId);
    else w.writeUInt16(spriteId);
  }
}

export function compileObjectData(data: ObjectData, dirtyIds?: Set<number>): ArrayBuffer {
  // No edits? Return the original file byte-for-byte.
  if (!dirtyIds || dirtyIds.size === 0) {
    console.log('[OB] Compile: no edits, returning original buffer');
    return data.originalBuffer.slice(0);
  }

  console.log(`[OB] Compile: rebuilding with ${dirtyIds.size} edited thing(s)`);

  const w = new PacketWriter(1024 * 1024); // 1MB initial

  // Copy the original header verbatim (header + counts = payloadOffset + 8 bytes)
  const headerBytes = new Uint8Array(data.originalBuffer, 0, 28); // 20 header + 8 counts
  w.writeBytes(headerBytes);

  const totalCount = data.itemCount + data.outfitCount + data.effectCount + data.distanceCount;

  for (let id = 100; id <= totalCount; id++) {
    const thing = data.things.get(id);
    if (!thing) {
      // Write empty flags + minimal frame group for missing entries
      w.writeUInt8(ATTR.ThingAttrLast);
      w.writeUInt8(1); w.writeUInt8(1); // 1x1
      w.writeUInt8(1); // layers
      w.writeUInt8(1); // patternX
      w.writeUInt8(1); // patternY
      if (data.version >= 755) w.writeUInt8(1); // patternZ
      w.writeUInt8(1); // animationLength
      if (data.version >= 960) w.writeUInt32(0); else w.writeUInt16(0);
      continue;
    }

    // Use raw bytes for unedited things (lossless round-trip)
    if (thing.rawBytes && !dirtyIds.has(id)) {
      w.writeBytes(thing.rawBytes);
      continue;
    }

    // Re-serialize from parsed data for edited things
    writeFlags(w, thing.flags, data.version);

    const isOutfit = thing.category === 'outfit';
    const hasFrameGroups = data.version >= 1050 && isOutfit;

    if (hasFrameGroups) {
      w.writeUInt8(thing.frameGroups.length);
    }

    for (const fg of thing.frameGroups) {
      writeFrameGroup(w, fg, data.version, hasFrameGroups);
    }
  }

  return w.toArrayBuffer();
}
