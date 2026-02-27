/**
 * Parses .eobj / .dat files into ObjectData.
 * Ported from Emperia-Client object-buffer.ts — standalone, no game deps.
 */
import PacketReader from './packet-reader';
import { parseEmperiaHeader, EMPERIA_HEADER_SIZE, EmperiaFileType } from './emperia-format';
import type { ObjectData, ThingType, ThingFlags, FrameGroup, ThingCategory } from './types';

const LEGACY_SIGNATURES: Record<string, number> = {
  "41BF619C": 740,
  "439D5A33": 760,
  "42A3": 1098,
};

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
        packet.readUInt16(); // max text length
        break;
      case ATTR.ThingAttrWritableOnce:
        flags.writableOnce = true;
        packet.readUInt16();
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
          const d = packet.readLight();
          flags.displacementX = d.level;
          flags.displacementY = d.color;
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
        packet.readUInt16();
        break;
      case ATTR.ThingAttrFullGround: flags.fullGround = true; break;
      case ATTR.ThingAttrLook: flags.look = true; break;
      case ATTR.ThingAttrCloth:
        flags.cloth = true;
        flags.clothSlot = packet.readUInt16();
        break;
      case ATTR.ThingAttrMarket:
        flags.hasMarket = true;
        packet.skip(6);
        packet.readString();
        packet.skip(4);
        break;
      case ATTR.ThingAttrUsable:
        flags.usable = true;
        packet.readUInt16();
        break;
      case ATTR.ThingAttrWrapable: flags.wrapable = true; break;
      case ATTR.ThingAttrUnwrapable: flags.unwrapable = true; break;
      case ATTR.ThingAttrTopEffect: flags.topEffect = true; break;
      case ATTR.ThingAttrOpacity: break;
      case ATTR.ThingAttrNotPreWalkable: break;
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

  if (width > 1 || height > 1) {
    packet.readUInt8(); // exact size hint — skip
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
    type, width, height, layers,
    patternX, patternY, patternZ,
    animationLength, asynchronous, nLoop, start,
    animationLengths, sprites,
  };
}

export function parseObjectData(buffer: ArrayBuffer): ObjectData {
  const header = parseEmperiaHeader(buffer);
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
  const effectCount = packet.readUInt16();
  const distanceCount = packet.readUInt16();
  const totalCount = itemCount + outfitCount + effectCount + distanceCount;

  const things = new Map<number, ThingType>();

  for (let id = 100; id <= totalCount; id++) {
    const flags = readFlags(packet, version);

    const isOutfit = id > itemCount && id <= itemCount + outfitCount;
    const hasFrameGroups = version >= 1050 && isOutfit;
    const groupCount = hasFrameGroups ? packet.readUInt8() : 1;

    const frameGroups: FrameGroup[] = [];
    for (let g = 0; g < groupCount; g++) {
      frameGroups.push(readFrameGroup(packet, version, hasFrameGroups));
    }

    let category: ThingCategory;
    if (id <= itemCount) category = 'item';
    else if (id <= itemCount + outfitCount) category = 'outfit';
    else if (id <= itemCount + outfitCount + effectCount) category = 'effect';
    else category = 'distance';

    things.set(id, { id, category, flags, frameGroups });
  }

  console.log(
    `[OB] Parsed ${things.size} things: items=${itemCount} outfits=${outfitCount} effects=${effectCount} distances=${distanceCount}`
  );

  return { version, itemCount, outfitCount, effectCount, distanceCount, things };
}
