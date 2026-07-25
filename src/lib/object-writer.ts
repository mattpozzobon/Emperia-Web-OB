/**
 * Compiles ObjectData back to .eobj binary format.
 * Inverse of object-parser.ts — writes Emperia header + flags + frame groups.
 */
import PacketWriter from './packet-writer';
import { EMPERIA_MAGIC, EmperiaFileType } from './emperia-format';
import type { ObjectData, ThingFlags, FrameGroup, EquipmentAppearance, HairDefinition } from './types';
import { encodeItemSlotType } from './item-slot-types';

const EOBJ_FORMAT_VERSION = 6;

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
  ThingAttrRenderBelowCreatures: 102,
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
      w.writeUInt16((flags.displacementX ?? 0) & 0xFFFF);
      w.writeUInt16((flags.displacementY ?? 0) & 0xFFFF);
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
  if (flags.renderBelowCreatures) writeAttr(ATTR.ThingAttrRenderBelowCreatures);
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
    w.writeUInt8(fg.exactSizeHint ?? Math.max(fg.width, fg.height));
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

export function compileObjectData(
  data: ObjectData,
  dirtyIds: Set<number> = new Set(),
  itemAppearances: Map<number, number> = data.itemAppearances,
  itemSlotTypes: Map<number, string> = data.itemSlotTypes,
  equipmentAppearances: Map<number, EquipmentAppearance> = data.equipmentAppearances,
  hairDefinitions: Map<number, HairDefinition> = data.hairDefinitions,
): ArrayBuffer {
  const w = new PacketWriter(1024 * 1024); // 1MB initial

  // Copy the original 20-byte Emperia header, then write current counts
  // (counts may have changed if things were added/removed)
  // Ensure feature flags byte (offset 0x0F) is correct — previous Web OB builds
  // wrote 0x00 which breaks legacy OB parsing (wrong extended/transparency).
  const isExtended = data.version >= 960;
  const isTransparent = data.version >= 960;
  const hasFrameGroups = data.version >= 1050;
  const hasFrameDurations = data.version >= 1050;
  let hdrFlags = 0;
  if (isExtended)       hdrFlags |= 0x01;
  if (isTransparent)    hdrFlags |= 0x02;
  if (hasFrameGroups)   hdrFlags |= 0x04;
  if (hasFrameDurations) hdrFlags |= 0x08;
  w.writeBytes(EMPERIA_MAGIC);
  w.writeUInt8(EmperiaFileType.OBJECT_DEFS);
  w.writeUInt16(EOBJ_FORMAT_VERSION);
  w.writeUInt32(data.version);
  w.writeUInt8(hdrFlags);
  w.writeUInt32(0);
  w.writeUInt16(data.itemCount);
  w.writeUInt16(data.outfitCount);
  w.writeUInt16(data.equipmentCount);
  w.writeUInt16(data.hairCount);
  w.writeUInt16(data.effectCount);
  w.writeUInt16(data.distanceCount);

  const mappings = Array.from(itemAppearances.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(mappings.length);
  for (const [itemId, appearanceId] of mappings) {
    if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xFFFF) {
      throw new Error(`Public item ID ${itemId} is outside the UInt16 protocol range`);
    }
    if (!Number.isInteger(appearanceId) || appearanceId < 100 || appearanceId > data.itemCount) {
      throw new Error(`Item ${itemId} references invalid EOBJ appearance ${appearanceId}`);
    }
    w.writeUInt16(itemId);
    w.writeUInt16(appearanceId);
  }

  const outfitMappings = Array.from(data.outfitAppearances.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(outfitMappings.length);
  for (const [outfitId, appearanceId] of outfitMappings) {
    if (!Number.isInteger(outfitId) || outfitId <= 0 || outfitId > 0xFFFF) {
      throw new Error(`Public outfit ID ${outfitId} is outside the UInt16 protocol range`);
    }
    if (!Number.isInteger(appearanceId) || appearanceId < 0 || appearanceId >= data.outfitCount) {
      throw new Error(`Outfit ${outfitId} references invalid local appearance ${appearanceId}`);
    }
    w.writeUInt16(outfitId);
    w.writeUInt16(appearanceId);
  }

  const slotTypes = Array.from(itemSlotTypes.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(slotTypes.length);
  for (const [itemId, slotType] of slotTypes) {
    if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xFFFF) {
      throw new Error(`Item slot metadata ID ${itemId} is outside the UInt16 protocol range`);
    }
    w.writeUInt16(itemId);
    w.writeUInt8(encodeItemSlotType(slotType));
  }

  const equipment = Array.from(equipmentAppearances.entries()).sort(([a], [b]) => a - b);
  w.writeUInt32(equipment.length);
  for (const [itemId, appearance] of equipment) {
    if (!Number.isInteger(itemId) || itemId <= 0 || itemId > 0xFFFF) {
      throw new Error(`Equipment item ID ${itemId} is outside the UInt16 protocol range`);
    }
    let mask = 0;
    if (appearance.default != null) mask |= 0x01;
    if (appearance.left != null) mask |= 0x02;
    if (appearance.right != null) mask |= 0x04;
    if (mask === 0) throw new Error(`Equipment item ${itemId} has no worn appearance`);
    w.writeUInt16(itemId);
    w.writeUInt8(mask);
    if (appearance.default != null) {
      if (appearance.default < 0 || appearance.default >= data.equipmentCount) throw new Error(`Equipment item ${itemId} references invalid appearance ${appearance.default}`);
      w.writeUInt16(appearance.default);
    }
    if (appearance.left != null) {
      if (appearance.left < 0 || appearance.left >= data.equipmentCount) throw new Error(`Equipment item ${itemId} references invalid left appearance ${appearance.left}`);
      w.writeUInt16(appearance.left);
    }
    if (appearance.right != null) {
      if (appearance.right < 0 || appearance.right >= data.equipmentCount) throw new Error(`Equipment item ${itemId} references invalid right appearance ${appearance.right}`);
      w.writeUInt16(appearance.right);
    }
  }

  const visualEquipment = Array.from(data.visualEquipmentAppearances.values())
    .sort((a, b) => a.visualEquipmentId - b.visualEquipmentId);
  if (visualEquipment.length > 0xFFFF) throw new Error('Visual equipment catalog exceeds the UInt16 entry limit');
  w.writeUInt16(visualEquipment.length);
  for (const visual of visualEquipment) {
    if (!Number.isInteger(visual.visualEquipmentId) || visual.visualEquipmentId <= 0 || visual.visualEquipmentId > 0xFFFF) {
      throw new Error(`Visual equipment ID ${visual.visualEquipmentId} is outside the UInt16 protocol range`);
    }
    if (!Number.isInteger(visual.equipmentAppearanceId) || visual.equipmentAppearanceId < 0 || visual.equipmentAppearanceId >= data.equipmentCount) {
      throw new Error(`Visual equipment ${visual.visualEquipmentId} references invalid appearance ${visual.equipmentAppearanceId}`);
    }
    w.writeUInt16(visual.visualEquipmentId);
    w.writeUInt16(visual.equipmentAppearanceId);
    w.writeString(visual.name);
  }

  const hairs = Array.from(hairDefinitions.values()).sort((a, b) => a.hairId - b.hairId);
  if (hairs.length > 0xFFFF) throw new Error('Hair catalog exceeds the UInt16 entry limit');
  w.writeUInt16(hairs.length);
  for (const hair of hairs) {
    w.writeUInt16(hair.hairId);
    if (hair.appearanceId < 0 || hair.appearanceId >= data.hairCount) {
      throw new Error(`Hair ${hair.hairId} references invalid appearance ${hair.appearanceId}`);
    }
    w.writeUInt16(hair.appearanceId);
    w.writeUInt8(hair.races);
    w.writeUInt8(hair.genders);
    w.writeUInt8(hair.tiers);
    w.writeUInt16(hair.sortOrder);
    w.writeString(hair.name);
  }

  const totalCount = data.itemCount + data.outfitCount + data.equipmentCount
    + data.hairCount + data.effectCount + data.distanceCount;

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

    const isLayeredAppearance = thing.category === 'outfit' || thing.category === 'equipment' || thing.category === 'hair';
    const hasFrameGroups = data.version >= 1050 && isLayeredAppearance;

    if (hasFrameGroups) {
      w.writeUInt8(thing.frameGroups.length);
    }

    for (const fg of thing.frameGroups) {
      writeFrameGroup(w, fg, data.version, hasFrameGroups);
    }
  }

  return w.toArrayBuffer();
}
