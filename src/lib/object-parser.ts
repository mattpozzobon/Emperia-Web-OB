/**
 * Parses .eobj / .dat files into ObjectData.
 * Ported from Emperia-Client object-buffer.ts — standalone, no game deps.
 */
import PacketReader from './packet-reader';
import { parseEmperiaHeader, EMPERIA_HEADER_SIZE, EmperiaFileType } from './emperia-format';
import type { ObjectData, ThingType, ThingFlags, FrameGroup, ThingCategory } from './types';
import { decodeItemSlotType } from './item-slot-types';

const LEGACY_SIGNATURES: Record<string, number> = {
  "41BF619C": 740,
  "439D5A33": 760,
  "42A3": 1098,
};

const LEGACY_VISUAL_EQUIPMENT = [
  [800, 'Belt Health Potion'],
  [801, 'Belt Mana Potion'],
  [802, 'Belt Stamina Potion'],
  [803, 'Belt Pouch'],
  [919, 'Sword'],
  [936, 'Sword'],
  [949, 'Apron'],
  [950, 'Shirt'],
  [951, 'Cook Hat'],
  [953, 'Red Skull'],
  [954, 'White Skull'],
  [960, 'Prisoner Outfit'],
] as const;

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
  ThingAttrOpacity: 100,
  ThingAttrNotPreWalkable: 101,
  ThingAttrRenderBelowCreatures: 102,
  ThingAttrFloorChange: 252,
  ThingAttrNoMoveAnimation: 253,
  ThingAttrChargeable: 254,
  ThingAttrLast: 255,
} as const;

function mapVersionFlag(flag: number, version: number): number {
  if (flag === ATTR.ThingAttrLast) return flag;

  if (version >= 1000) {
    if (flag === 16) return ATTR.ThingAttrNoMoveAnimation;
    if (flag > 16) return flag - 1;
  } else if (version >= 755) {
    if (flag === 23) return ATTR.ThingAttrFloorChange;
  } else if (version >= 740) {
    if (flag > 0 && flag <= 15) {
      if (flag === 5) return ATTR.ThingAttrMultiUse;
      if (flag === 6) return ATTR.ThingAttrForceUse;
      return flag + 1;
    }
    switch (flag) {
      case 16: return ATTR.ThingAttrLight;
      case 17: return ATTR.ThingAttrFloorChange;
      case 18: return ATTR.ThingAttrFullGround;
      case 19: return ATTR.ThingAttrElevation;
      case 20: return ATTR.ThingAttrDisplacement;
      case 22: return ATTR.ThingAttrMinimapColor;
      case 23: return ATTR.ThingAttrRotateable;
      case 24: return ATTR.ThingAttrLyingCorpse;
      case 25: return ATTR.ThingAttrHangable;
      case 26: return ATTR.ThingAttrHookSouth;
      case 27: return ATTR.ThingAttrHookEast;
      case 28: return ATTR.ThingAttrAnimateAlways;
    }
  }
  return flag;
}

function emptyFlags(): ThingFlags {
  return {
    ground: false, groundBorder: false, onBottom: false, onTop: false,
    container: false, stackable: false, forceUse: false, multiUse: false,
    writable: false, writableOnce: false, fluidContainer: false, splash: false,
    notWalkable: false, notMoveable: false, blockProjectile: false,
    notPathable: false, pickupable: false, hangable: false, hookSouth: false,
    hookEast: false, rotateable: false, hasLight: false, dontHide: false,
    translucent: false, hasDisplacement: false, hasElevation: false,
    lyingCorpse: false, animateAlways: false, hasMinimapColor: false,
    fullGround: false, look: false, cloth: false, hasMarket: false,
    usable: false, wrapable: false, unwrapable: false, topEffect: false,
    renderBelowCreatures: false,
    noMoveAnimation: false, chargeable: false,
  };
}

function readFlags(packet: PacketReader, version: number): ThingFlags {
  const flags = emptyFlags();

  while (true) {
    const rawFlag = packet.readUInt8();
    const flag = mapVersionFlag(rawFlag, version);

    switch (flag) {
      case ATTR.ThingAttrLast: return flags;
      case ATTR.ThingAttrGround:
        flags.ground = true;
        flags.groundSpeed = packet.readUInt16();
        break;
      case ATTR.ThingAttrGroundBorder: flags.groundBorder = true; break;
      case ATTR.ThingAttrOnBottom: flags.onBottom = true; break;
      case ATTR.ThingAttrOnTop: flags.onTop = true; break;
      case ATTR.ThingAttrContainer: flags.container = true; break;
      case ATTR.ThingAttrStackable: flags.stackable = true; break;
      case ATTR.ThingAttrForceUse: flags.forceUse = true; break;
      case ATTR.ThingAttrMultiUse: flags.multiUse = true; break;
      case ATTR.ThingAttrWritable:
        flags.writable = true;
        flags.writableMaxLen = packet.readUInt16();
        break;
      case ATTR.ThingAttrWritableOnce:
        flags.writableOnce = true;
        flags.writableOnceMaxLen = packet.readUInt16();
        break;
      case ATTR.ThingAttrFluidContainer: flags.fluidContainer = true; break;
      case ATTR.ThingAttrSplash: flags.splash = true; break;
      case ATTR.ThingAttrNotWalkable: flags.notWalkable = true; break;
      case ATTR.ThingAttrNotMoveable: flags.notMoveable = true; break;
      case ATTR.ThingAttrBlockProjectile: flags.blockProjectile = true; break;
      case ATTR.ThingAttrNotPathable: flags.notPathable = true; break;
      case ATTR.ThingAttrPickupable: flags.pickupable = true; break;
      case ATTR.ThingAttrHangable: flags.hangable = true; break;
      case ATTR.ThingAttrHookSouth: flags.hookSouth = true; break;
      case ATTR.ThingAttrHookEast: flags.hookEast = true; break;
      case ATTR.ThingAttrRotateable: flags.rotateable = true; break;
      case ATTR.ThingAttrLight: {
        flags.hasLight = true;
        const light = packet.readLight();
        flags.lightLevel = light.level;
        flags.lightColor = light.color;
        break;
      }
      case ATTR.ThingAttrDontHide: flags.dontHide = true; break;
      case ATTR.ThingAttrTranslucent: flags.translucent = true; break;
      case ATTR.ThingAttrDisplacement: {
        flags.hasDisplacement = true;
        if (version >= 755) {
          flags.displacementX = packet.readInt16();
          flags.displacementY = packet.readInt16();
        }
        break;
      }
      case ATTR.ThingAttrElevation:
        flags.hasElevation = true;
        flags.elevation = packet.readUInt16();
        break;
      case ATTR.ThingAttrLyingCorpse: flags.lyingCorpse = true; break;
      case ATTR.ThingAttrAnimateAlways: flags.animateAlways = true; break;
      case ATTR.ThingAttrMinimapColor:
        flags.hasMinimapColor = true;
        flags.minimapColor = packet.readUInt16();
        break;
      case ATTR.ThingAttrLensHelp:
        flags.lensHelp = packet.readUInt16();
        break;
      case ATTR.ThingAttrFullGround: flags.fullGround = true; break;
      case ATTR.ThingAttrLook: flags.look = true; break;
      case ATTR.ThingAttrCloth:
        flags.cloth = true;
        flags.clothSlot = packet.readUInt16();
        break;
      case ATTR.ThingAttrMarket:
        flags.hasMarket = true;
        flags.marketCategory = packet.readUInt16();
        flags.marketTradeAs = packet.readUInt16();
        flags.marketShowAs = packet.readUInt16();
        flags.marketName = packet.readString();
        flags.marketRestrictVocation = packet.readUInt16();
        flags.marketRequiredLevel = packet.readUInt16();
        break;
      case ATTR.ThingAttrUsable:
        flags.usable = true;
        flags.usableActionId = packet.readUInt16();
        break;
      case ATTR.ThingAttrWrapable: flags.wrapable = true; break;
      case ATTR.ThingAttrUnwrapable: flags.unwrapable = true; break;
      case ATTR.ThingAttrTopEffect: flags.topEffect = true; break;
      case ATTR.ThingAttrOpacity: break;
      case ATTR.ThingAttrNotPreWalkable: break;
      case ATTR.ThingAttrRenderBelowCreatures: flags.renderBelowCreatures = true; break;
      case ATTR.ThingAttrFloorChange: break;
      case ATTR.ThingAttrNoMoveAnimation: flags.noMoveAnimation = true; break;
      case ATTR.ThingAttrChargeable: flags.chargeable = true; break;
      default:
        throw new Error(`Unknown flag 0x${flag.toString(16)} at offset ${packet.index}`);
    }
  }
}

function readFrameGroup(packet: PacketReader, version: number, hasGroupType: boolean): FrameGroup {
  const type = hasGroupType ? packet.readUInt8() : 0;
  const width = packet.readUInt8();
  const height = packet.readUInt8();
  let exactSizeHint: number | undefined;

  if (width > 1 || height > 1) {
    exactSizeHint = packet.readUInt8();
  }

  const layers = packet.readUInt8();
  const patternX = packet.readUInt8();
  const patternY = packet.readUInt8();
  const patternZ = version >= 755 ? packet.readUInt8() : 1;
  const animationLength = packet.readUInt8();

  let asynchronous = 0, nLoop = 0, start = 0;
  const animationLengths: { min: number; max: number }[] = [];

  if (animationLength > 1 && version >= 1050) {
    asynchronous = packet.readUInt8();
    nLoop = packet.readUInt32();
    start = packet.readInt8();
    for (let i = 0; i < animationLength; i++) {
      animationLengths.push(packet.readAnimationLength());
    }
  }

  const numSprites = width * height * layers * patternX * patternY * patternZ * animationLength;
  const sprites: number[] = [];
  for (let i = 0; i < numSprites; i++) {
    sprites.push(version >= 960 ? packet.readUInt32() : packet.readUInt16());
  }

  return {
    type, width, height, ...(exactSizeHint != null ? { exactSizeHint } : {}), layers,
    patternX, patternY, patternZ,
    animationLength, asynchronous, nLoop, start,
    animationLengths, sprites,
  };
}

export function parseObjectData(buffer: ArrayBuffer): ObjectData {
  const header = parseEmperiaHeader(buffer);
  const formatVersion = header?.formatVersion ?? 0;
  let version: number;
  let payloadOffset: number;

  if (header) {
    if (header.fileType !== EmperiaFileType.OBJECT_DEFS) {
      throw new Error(`Expected object definitions (0x02), got 0x${header.fileType.toString(16)}`);
    }
    version = header.contentVersion;
    payloadOffset = EMPERIA_HEADER_SIZE;
  } else {
    const dv = new DataView(buffer);
    const sig = dv.getUint32(0, true).toString(16).toUpperCase();
    if (!(sig in LEGACY_SIGNATURES)) {
      throw new Error("Unknown object definition file format.");
    }
    version = LEGACY_SIGNATURES[sig];
    payloadOffset = 4;
  }

  const packet = new PacketReader(buffer.slice(payloadOffset));

  const itemCount = packet.readUInt16();
  const outfitCount = packet.readUInt16();
  const equipmentCount = formatVersion >= 5 ? packet.readUInt16() : 0;
  const hairCount = formatVersion >= 5 ? packet.readUInt16() : 0;
  const effectCount = packet.readUInt16();
  const distanceCount = packet.readUInt16();
  const itemAppearances = new Map<number, number>();
  if (formatVersion >= 2) {
    const mappingCount = packet.readUInt32();
    for (let index = 0; index < mappingCount; index++) {
      itemAppearances.set(packet.readUInt16(), packet.readUInt16());
    }
  }
  const outfitAppearances = new Map<number, number>();
  if (formatVersion >= 5) {
    const mappingCount = packet.readUInt32();
    for (let index = 0; index < mappingCount; index++) {
      outfitAppearances.set(packet.readUInt16(), packet.readUInt16());
    }
  }
  const itemSlotTypes = new Map<number, string>();
  if (formatVersion >= 3) {
    const slotTypeCount = packet.readUInt32();
    for (let index = 0; index < slotTypeCount; index++) {
      itemSlotTypes.set(packet.readUInt16(), decodeItemSlotType(packet.readUInt8()));
    }
  }
  const equipmentAppearances = new Map<number, import('./types').EquipmentAppearance>();
  const visualEquipmentAppearances = new Map<number, import('./types').VisualEquipmentAppearance>();
  const hairDefinitions = new Map<number, import('./types').HairDefinition>();
  if (formatVersion >= 4) {
    const equipmentCount = packet.readUInt32();
    for (let index = 0; index < equipmentCount; index++) {
      const itemId = packet.readUInt16();
      const mask = packet.readUInt8();
      const appearance: import('./types').EquipmentAppearance = {};
      if (mask & 0x01) appearance.default = packet.readUInt16();
      if (mask & 0x02) appearance.left = packet.readUInt16();
      if (mask & 0x04) appearance.right = packet.readUInt16();
      equipmentAppearances.set(itemId, appearance);
    }

    if (formatVersion >= 6) {
      const visualCount = packet.readUInt16();
      for (let index = 0; index < visualCount; index++) {
        const visualId = packet.readUInt16();
        visualEquipmentAppearances.set(visualId, {
          visualId,
          appearanceId: packet.readUInt16(),
          name: packet.readString(),
        });
      }
    }

    const definitionCount = packet.readUInt16();
    for (let index = 0; index < definitionCount; index++) {
      const hairId = packet.readUInt16();
      hairDefinitions.set(hairId, {
        hairId,
        appearanceId: packet.readUInt16(),
        races: packet.readUInt8(),
        genders: packet.readUInt8(),
        tiers: packet.readUInt8(),
        sortOrder: packet.readUInt16(),
        name: packet.readString(),
      });
    }
  }
  const totalCount = itemCount + outfitCount + equipmentCount + hairCount + effectCount + distanceCount;

  const things = new Map<number, ThingType>();

  for (let id = 100; id <= totalCount; id++) {
    const startOffset = packet.index;

    const flags = readFlags(packet, version);

    const outfitEnd = itemCount + outfitCount;
    const equipmentEnd = outfitEnd + equipmentCount;
    const hairEnd = equipmentEnd + hairCount;
    const effectEnd = hairEnd + effectCount;
    const isLayeredAppearance = id > itemCount && id <= hairEnd;
    const hasFrameGroups = version >= 1050 && isLayeredAppearance;
    const groupCount = hasFrameGroups ? packet.readUInt8() : 1;

    const frameGroups: FrameGroup[] = [];
    for (let g = 0; g < groupCount; g++) {
      frameGroups.push(readFrameGroup(packet, version, hasFrameGroups));
    }

    const endOffset = packet.index;
    const rawBytes = packet.buffer.slice(startOffset, endOffset);

    let category: ThingCategory;
    if (id <= itemCount) category = 'item';
    else if (id <= outfitEnd) category = 'outfit';
    else if (id <= equipmentEnd) category = 'equipment';
    else if (id <= hairEnd) category = 'hair';
    else if (id <= effectEnd) category = 'effect';
    else category = 'distance';

    things.set(id, { id, category, flags, frameGroups, rawBytes });
  }

  const parsed: ObjectData = {
    formatVersion,
    version,
    itemCount,
    outfitCount,
    equipmentCount,
    hairCount,
    effectCount,
    distanceCount,
    itemAppearances,
    outfitAppearances,
    itemSlotTypes,
    equipmentAppearances,
    visualEquipmentAppearances,
    hairDefinitions,
    things,
    originalBuffer: buffer,
  };

  if (formatVersion >= 6) return parsed;
  if (formatVersion === 5) return migrateVisualEquipment(parsed);

  // EOBJ v4 stored equipment and hair visuals inside the outfit section.
  // Convert that layout in memory so every subsequent compile emits v5.
  const equipmentOutfitIds = Array.from(new Set(
    Array.from(equipmentAppearances.values()).flatMap((appearance) =>
      [appearance.default, appearance.left, appearance.right].filter((id): id is number => id != null),
    ),
  )).sort((a, b) => a - b);
  const hairOutfitIds = Array.from(new Set(
    Array.from(hairDefinitions.values()).map((hair) => hair.appearanceId),
  )).sort((a, b) => a - b);
  const extracted = new Set([...equipmentOutfitIds, ...hairOutfitIds]);
  const retainedOutfitIds = Array.from({ length: outfitCount }, (_, index) => index + 1)
    .filter((id) => !extracted.has(id));
  const equipmentIdByOldOutfit = new Map(equipmentOutfitIds.map((id, index) => [id, index]));
  const hairIdByOldOutfit = new Map(hairOutfitIds.map((id, index) => [id, index]));
  const migratedThings = new Map<number, ThingType>();
  for (let id = 100; id <= itemCount; id++) {
    const thing = things.get(id);
    if (thing) migratedThings.set(id, { ...thing, id, category: 'item' });
  }
  let nextId = itemCount + 1;
  const copyOutfit = (oldOutfitId: number, category: ThingCategory) => {
    if (oldOutfitId === 0) {
      const templateId = hairOutfitIds.find((id) => id > 0) ?? equipmentOutfitIds[0];
      const template = templateId == null ? undefined : things.get(itemCount + templateId);
      if (!template) throw new Error('EOBJ v4 has no layered appearance available for the empty hair entry.');
      migratedThings.set(nextId, {
        ...template,
        id: nextId,
        category,
        rawBytes: undefined,
        frameGroups: template.frameGroups.map((group) => ({
          ...group,
          sprites: group.sprites.map(() => 0),
          animationLengths: group.animationLengths.map((duration) => ({ ...duration })),
        })),
      });
      nextId++;
      return;
    }
    const source = things.get(itemCount + oldOutfitId);
    if (!source) throw new Error(`EOBJ v4 references missing outfit appearance ${oldOutfitId}.`);
    migratedThings.set(nextId, { ...source, id: nextId, category });
    nextId++;
  };
  retainedOutfitIds.forEach((id, index) => {
    outfitAppearances.set(id, index);
    copyOutfit(id, 'outfit');
  });
  equipmentOutfitIds.forEach((id) => copyOutfit(id, 'equipment'));
  hairOutfitIds.forEach((id) => copyOutfit(id, 'hair'));
  for (let index = 1; index <= effectCount; index++) {
    const source = things.get(itemCount + outfitCount + index);
    if (source) migratedThings.set(nextId, { ...source, id: nextId, category: 'effect' });
    nextId++;
  }
  for (let index = 1; index <= distanceCount; index++) {
    const source = things.get(itemCount + outfitCount + effectCount + index);
    if (source) migratedThings.set(nextId, { ...source, id: nextId, category: 'distance' });
    nextId++;
  }
  for (const appearance of equipmentAppearances.values()) {
    if (appearance.default != null) appearance.default = equipmentIdByOldOutfit.get(appearance.default);
    if (appearance.left != null) appearance.left = equipmentIdByOldOutfit.get(appearance.left);
    if (appearance.right != null) appearance.right = equipmentIdByOldOutfit.get(appearance.right);
  }
  for (const hair of hairDefinitions.values()) {
    const migratedId = hairIdByOldOutfit.get(hair.appearanceId);
    if (migratedId == null) throw new Error(`Could not migrate hair ${hair.hairId} appearance.`);
    hair.appearanceId = migratedId;
  }

  return migrateVisualEquipment({
    ...parsed,
    formatVersion: 5,
    outfitCount: retainedOutfitIds.length,
    equipmentCount: equipmentOutfitIds.length,
    hairCount: hairOutfitIds.length,
    things: migratedThings,
  });
}

function migrateVisualEquipment(data: ObjectData): ObjectData {
  const migrated: Array<{ visualId: number; name: string; outfitAppearanceId: number }> = LEGACY_VISUAL_EQUIPMENT
    .flatMap(([visualId, name]) => {
      const outfitAppearanceId = data.outfitAppearances.get(visualId);
      return outfitAppearanceId == null ? [] : [{ visualId, name, outfitAppearanceId }];
    })
    .sort((a, b) => a.outfitAppearanceId - b.outfitAppearanceId);

  if (migrated.length === 0) {
    return { ...data, formatVersion: 6 };
  }

  const movedOutfitAppearances = new Set(migrated.map((entry) => entry.outfitAppearanceId));
  const retainedOutfitAppearances = Array.from({ length: data.outfitCount }, (_, index) => index)
    .filter((appearanceId) => !movedOutfitAppearances.has(appearanceId));
  const newOutfitAppearanceByOld = new Map(
    retainedOutfitAppearances.map((oldAppearanceId, newAppearanceId) => [oldAppearanceId, newAppearanceId]),
  );
  const things = new Map<number, ThingType>();
  for (let id = 100; id <= data.itemCount; id++) {
    const thing = data.things.get(id);
    if (thing) things.set(id, { ...thing, id, category: 'item' });
  }

  let nextId = data.itemCount + 1;
  const copyLocalAppearance = (
    category: ThingCategory,
    localAppearanceId: number,
    categoryStart: number,
  ) => {
    const source = data.things.get(categoryStart + localAppearanceId);
    if (!source) throw new Error(`Missing ${category} appearance ${localAppearanceId} during EOBJ v6 migration.`);
    things.set(nextId, { ...source, id: nextId, category });
    nextId++;
  };

  const outfitStart = data.itemCount + 1;
  const equipmentStart = outfitStart + data.outfitCount;
  const hairStart = equipmentStart + data.equipmentCount;
  const effectStart = hairStart + data.hairCount;
  const distanceStart = effectStart + data.effectCount;

  retainedOutfitAppearances.forEach((appearanceId) => copyLocalAppearance('outfit', appearanceId, outfitStart));
  for (let appearanceId = 0; appearanceId < data.equipmentCount; appearanceId++) {
    copyLocalAppearance('equipment', appearanceId, equipmentStart);
  }

  const visualEquipmentAppearances = new Map(data.visualEquipmentAppearances);
  migrated.forEach(({ visualId, name, outfitAppearanceId }, index) => {
    const appearanceId = data.equipmentCount + index;
    copyLocalAppearance('equipment', outfitAppearanceId, outfitStart);
    visualEquipmentAppearances.set(visualId, { visualId, appearanceId, name });
  });

  for (let appearanceId = 0; appearanceId < data.hairCount; appearanceId++) {
    copyLocalAppearance('hair', appearanceId, hairStart);
  }
  for (let appearanceId = 0; appearanceId < data.effectCount; appearanceId++) {
    copyLocalAppearance('effect', appearanceId, effectStart);
  }
  for (let appearanceId = 0; appearanceId < data.distanceCount; appearanceId++) {
    copyLocalAppearance('distance', appearanceId, distanceStart);
  }

  const outfitAppearances = new Map<number, number>();
  for (const [outfitId, oldAppearanceId] of data.outfitAppearances) {
    const appearanceId = newOutfitAppearanceByOld.get(oldAppearanceId);
    if (appearanceId != null) outfitAppearances.set(outfitId, appearanceId);
  }

  return {
    ...data,
    formatVersion: 6,
    outfitCount: retainedOutfitAppearances.length,
    equipmentCount: data.equipmentCount + migrated.length,
    outfitAppearances,
    visualEquipmentAppearances,
    things,
  };
}
