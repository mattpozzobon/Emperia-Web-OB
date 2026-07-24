export const ITEM_SLOT_TYPES = [
  'head',
  'body',
  'legs',
  'feet',
  'left-hand',
  'right-hand',
  'hand',
  'two-handed',
  'ring',
  'necklace',
  'backpack',
  'belt',
  'ammo',
  'quiver',
  'rope',
  'shovel',
  'pick',
  'knife',
  'machete',
  'fishingRod',
  'potion',
  'food',
  'rune',
  'key',
] as const;

export type ItemSlotType = typeof ITEM_SLOT_TYPES[number];

const SLOT_TYPE_TO_CODE = new Map<string, number>(
  ITEM_SLOT_TYPES.map((slotType, index) => [slotType, index + 1]),
);

export function encodeItemSlotType(slotType: string): number {
  const code = SLOT_TYPE_TO_CODE.get(slotType);
  if (code == null) throw new Error(`Unknown item slot type "${slotType}"`);
  return code;
}

export function decodeItemSlotType(code: number): ItemSlotType {
  const slotType = ITEM_SLOT_TYPES[code - 1];
  if (!slotType) throw new Error(`Unknown item slot type code ${code}`);
  return slotType;
}
