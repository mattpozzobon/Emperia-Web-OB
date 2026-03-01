/**
 * Pure helper functions for thing ID allocation and shifting.
 */
import type { ObjectData, ThingCategory } from '../lib/types';

/**
 * Shift all things with id >= shiftFrom up by 1.
 * Must iterate in reverse to avoid overwrites.
 * Also shifts dirtyIds and returns the new set.
 */
export function shiftThingsUp(od: ObjectData, shiftFrom: number, oldTotal: number, dirtyIds: Set<number>): Set<number> {
  for (let id = oldTotal; id >= shiftFrom; id--) {
    const t = od.things.get(id);
    if (t) {
      t.id = id + 1;
      od.things.set(id + 1, t);
      od.things.delete(id);
    }
  }
  const newDirty = new Set<number>();
  for (const d of dirtyIds) {
    newDirty.add(d >= shiftFrom ? d + 1 : d);
  }
  return newDirty;
}

/**
 * Shift all things with id > shiftAfter down by 1.
 * Must iterate forward to avoid overwrites.
 * Also shifts dirtyIds.
 */
export function shiftThingsDown(od: ObjectData, shiftAfter: number, oldTotal: number, dirtyIds: Set<number>): Set<number> {
  for (let id = shiftAfter + 1; id <= oldTotal; id++) {
    const t = od.things.get(id);
    if (t) {
      t.id = id - 1;
      od.things.set(id - 1, t);
      od.things.delete(id);
    }
  }
  const newDirty = new Set<number>();
  for (const d of dirtyIds) {
    if (d === shiftAfter) continue; // removed thing
    newDirty.add(d > shiftAfter ? d - 1 : d);
  }
  return newDirty;
}

/**
 * Allocate a new thing ID in the given category and shift higher categories.
 * Returns { insertId, dirtyIds } with the new thing's ID and updated dirty set.
 */
export function allocateThingId(od: ObjectData, cat: ThingCategory, dirtyIds: Set<number>): { insertId: number; dirtyIds: Set<number> } {
  const oldTotal = od.itemCount + od.outfitCount + od.effectCount + od.distanceCount;
  let insertId: number;
  let shiftFrom: number;

  switch (cat) {
    case 'item':
      od.itemCount++;
      insertId = od.itemCount;
      shiftFrom = insertId;
      break;
    case 'outfit':
      od.outfitCount++;
      insertId = od.itemCount + od.outfitCount;
      shiftFrom = insertId;
      break;
    case 'effect':
      od.effectCount++;
      insertId = od.itemCount + od.outfitCount + od.effectCount;
      shiftFrom = insertId;
      break;
    case 'distance':
      od.distanceCount++;
      insertId = od.itemCount + od.outfitCount + od.effectCount + od.distanceCount;
      shiftFrom = insertId + 1; // last category, nothing to shift
      break;
  }

  const newDirty = shiftFrom <= oldTotal
    ? shiftThingsUp(od, shiftFrom, oldTotal, dirtyIds)
    : new Set(dirtyIds);
  newDirty.add(insertId);
  return { insertId, dirtyIds: newDirty };
}
