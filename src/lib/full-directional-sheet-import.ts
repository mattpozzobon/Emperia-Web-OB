import type { FrameGroup, ThingType } from './types';

export interface FullDirectionalSheetImportResult {
  idleFrames: number;
  movingFrames: number;
}

interface FullDirectionalSheetImportOptions {
  file: File;
  thing: ThingType;
  addSprite: (imageData: ImageData) => number | null;
  idleFrames: number;
  movingFrames: number;
  spriteSize: 32 | 64;
  /** Source column for each target direction: North, East, South, West. */
  directionSourceColumns: readonly number[];
  /** Source row for each target Idle frame. */
  idleSourceRows: readonly number[];
  /** Source row for each target Moving frame. */
  movingSourceRows: readonly number[];
}

const DIRECTION_COLUMNS = 4;
const MAX_FRAME_COUNT = 255;
const SUPPORTED_CATEGORIES = new Set(['equipment', 'hair', 'outfit']);

const getSpriteIndex = (
  group: FrameGroup,
  frame: number,
  direction: number,
  tx: number,
  ty: number,
): number => (
  ((((((frame * group.patternZ) * group.patternY) * group.patternX + direction)
    * group.layers) * group.height + ty) * group.width + tx)
);

const loadImage = (file: File): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(imageUrl);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(imageUrl);
    reject(new Error('Could not load the selected image.'));
  };
  image.src = imageUrl;
});

export async function importFullDirectionalSheet({
  file,
  thing,
  addSprite,
  idleFrames,
  movingFrames,
  spriteSize,
  directionSourceColumns,
  idleSourceRows,
  movingSourceRows,
}: FullDirectionalSheetImportOptions): Promise<FullDirectionalSheetImportResult> {
  const image = await loadImage(file);
  if (!SUPPORTED_CATEGORIES.has(thing.category)) {
    throw new Error('Select an Equipment, Hair, or Outfit object before importing a directional sheet.');
  }
  if (
    !Number.isInteger(idleFrames)
    || !Number.isInteger(movingFrames)
    || idleFrames < 1
    || movingFrames < 1
    || idleFrames > MAX_FRAME_COUNT
    || movingFrames > MAX_FRAME_COUNT
  ) {
    throw new Error(`Idle and Moving frame counts must each be between 1 and ${MAX_FRAME_COUNT}.`);
  }
  if (spriteSize !== 32 && spriteSize !== 64) {
    throw new Error('Sprite size must be either 32x32 or 64x64 pixels.');
  }

  const idle = thing.frameGroups[0];
  if (!idle) throw new Error('The object has no Idle frame group.');
  const spriteTiles = spriteSize / 32;
  const blockWidth = spriteSize;
  const blockHeight = spriteSize;
  if (image.width % blockWidth !== 0 || image.height % blockHeight !== 0) {
    throw new Error(
      `The image dimensions must be exact multiples of ${spriteSize}px.`,
    );
  }
  const sourceColumnCount = image.width / blockWidth;
  const sourceRowCount = image.height / blockHeight;

  const validateMapping = (
    label: string,
    sourceIndexes: readonly number[],
    expectedCount: number,
    sourceCount: number,
  ) => {
    if (
      sourceIndexes.length !== expectedCount
      || sourceIndexes.some((index) => !Number.isInteger(index) || index < 0 || index >= sourceCount)
      || new Set(sourceIndexes).size !== sourceIndexes.length
    ) {
      throw new Error(`${label} mapping is incomplete or contains a duplicate source.`);
    }
  };
  validateMapping('Direction', directionSourceColumns, DIRECTION_COLUMNS, sourceColumnCount);
  validateMapping('Idle row', idleSourceRows, idleFrames, sourceRowCount);
  validateMapping('Moving row', movingSourceRows, movingFrames, sourceRowCount);
  if (new Set([...idleSourceRows, ...movingSourceRows]).size !== idleFrames + movingFrames) {
    throw new Error('Each source row can only be assigned to one Idle or Moving frame.');
  }

  // Directional sheets use square 32px tiles. Normalize the object to either
  // one tile (32x32) or a 2x2 tile block (64x64) only after the entire source
  // mapping has passed validation.
  idle.type = 0;
  idle.width = spriteTiles;
  idle.height = spriteTiles;
  idle.exactSizeHint = spriteTiles;
  idle.layers = 1;
  idle.patternX = DIRECTION_COLUMNS;
  idle.patternY = 1;
  idle.patternZ = 1;

  idle.animationLength = idleFrames;
  idle.animationLengths = Array.from({ length: idleFrames }, (_, index) => (
    idle.animationLengths[index] ?? (idleFrames === 1 ? { min: 0, max: 0 } : { min: 100, max: 100 })
  ));
  const idleSlotCount = (
    idle.width
    * idle.height
    * idle.layers
    * idle.patternX
    * idle.patternY
    * idle.patternZ
    * idle.animationLength
  );
  if (idle.sprites.length > idleSlotCount) {
    idle.sprites.length = idleSlotCount;
  } else {
    while (idle.sprites.length < idleSlotCount) idle.sprites.push(0);
  }

  let moving = thing.frameGroups[1];
  if (!moving) {
    moving = {
      ...idle,
      type: 1,
      animationLength: movingFrames,
      animationLengths: Array.from({ length: movingFrames }, () => ({ min: 100, max: 100 })),
      sprites: [],
    };
    thing.frameGroups.push(moving);
  }

  moving.type = 1;
  moving.width = spriteTiles;
  moving.height = spriteTiles;
  moving.exactSizeHint = spriteTiles;
  moving.layers = 1;
  moving.patternX = DIRECTION_COLUMNS;
  moving.patternY = 1;
  moving.patternZ = 1;
  moving.animationLength = movingFrames;
  moving.animationLengths = Array.from({ length: movingFrames }, (_, index) => (
    moving.animationLengths[index] ?? { min: 100, max: 100 }
  ));
  const movingSlotCount = (
    moving.width
    * moving.height
    * moving.layers
    * moving.patternX
    * moving.patternY
    * moving.patternZ
    * moving.animationLength
  );
  if (moving.sprites.length > movingSlotCount) {
    moving.sprites.length = movingSlotCount;
  } else {
    while (moving.sprites.length < movingSlotCount) moving.sprites.push(0);
  }
  thing.frameGroups = [idle, moving];

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = 32;
  tileCanvas.height = 32;
  const tileContext = tileCanvas.getContext('2d')!;

  const assignSprite = (targetGroup: FrameGroup, index: number, imageData: ImageData) => {
    // A complete-sheet import must give every slot an independent sprite.
    // Replacing an existing atlas ID can overwrite another frame/group that
    // happens to reference the same ID.
    const newId = addSprite(imageData);
    if (newId != null) targetGroup.sprites[index] = newId;
  };

  const importFrame = (
    targetGroup: FrameGroup,
    frame: number,
    targetDirection: number,
    sourceColumn: number,
    sourceRow: number,
  ) => {
    for (let visualRow = 0; visualRow < targetGroup.height; visualRow++) {
      for (let visualColumn = 0; visualColumn < targetGroup.width; visualColumn++) {
        tileContext.clearRect(0, 0, 32, 32);
        tileContext.drawImage(
          image,
          sourceColumn * blockWidth + visualColumn * 32,
          sourceRow * blockHeight + visualRow * 32,
          32,
          32,
          0,
          0,
          32,
          32,
        );
        const tileData = tileContext.getImageData(0, 0, 32, 32);
        const tx = targetGroup.width - 1 - visualColumn;
        const ty = targetGroup.height - 1 - visualRow;
        const index = getSpriteIndex(targetGroup, frame, targetDirection, tx, ty);
        if (index < targetGroup.sprites.length) assignSprite(targetGroup, index, tileData);
      }
    }
  };

  for (let direction = 0; direction < DIRECTION_COLUMNS; direction++) {
    for (let frame = 0; frame < idleFrames; frame++) {
      importFrame(
        idle,
        frame,
        direction,
        directionSourceColumns[direction],
        idleSourceRows[frame],
      );
    }
    for (let frame = 0; frame < movingFrames; frame++) {
      importFrame(
        moving,
        frame,
        direction,
        directionSourceColumns[direction],
        movingSourceRows[frame],
      );
    }
  }

  thing.rawBytes = undefined;
  return { idleFrames, movingFrames };
}
