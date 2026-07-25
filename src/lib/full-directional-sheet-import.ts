import type { FrameGroup, ThingType } from './types';

export interface FullDirectionalSheetImportResult {
  idleFrames: number;
  movingFrames: number;
}

interface FullDirectionalSheetImportOptions {
  file: File;
  thing: ThingType;
  addSprite: (imageData: ImageData) => number | null;
}

const DIRECTION_COLUMNS = 4;
const IDLE_FRAME_ROWS = 1;
const MOVING_FRAME_ROWS = 2;
const TOTAL_FRAME_ROWS = IDLE_FRAME_ROWS + MOVING_FRAME_ROWS;
const EQUIPMENT_WIDTH = 2;
const EQUIPMENT_HEIGHT = 2;

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
}: FullDirectionalSheetImportOptions): Promise<FullDirectionalSheetImportResult> {
  const image = await loadImage(file);
  if (thing.category !== 'equipment') {
    throw new Error('Select an Equipment object before importing equipment.');
  }

  const idle = thing.frameGroups[0];
  if (!idle) throw new Error('The object has no Idle frame group.');

  // Equipment sheets have one fixed layout. Normalize a newly created slot
  // before validating or assigning any sprites.
  idle.type = 0;
  idle.width = EQUIPMENT_WIDTH;
  idle.height = EQUIPMENT_HEIGHT;
  idle.layers = 1;
  idle.patternX = DIRECTION_COLUMNS;
  idle.patternY = 1;
  idle.patternZ = 1;

  const blockWidth = idle.width * 32;
  const blockHeight = idle.height * 32;
  const expectedWidth = blockWidth * DIRECTION_COLUMNS;
  const expectedHeight = blockHeight * TOTAL_FRAME_ROWS;
  if (image.width !== expectedWidth || image.height !== expectedHeight) {
    throw new Error(
      `Invalid sheet size. For ${idle.width}x${idle.height}, the complete sheet must be `
      + `${expectedWidth}x${expectedHeight}px (4 columns x 3 rows).`,
    );
  }

  const idleFrames = IDLE_FRAME_ROWS;
  const movingFrames = MOVING_FRAME_ROWS;
  idle.animationLength = idleFrames;
  idle.animationLengths = [
    idle.animationLengths[0] ?? { min: 0, max: 0 },
  ];
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
  moving.width = EQUIPMENT_WIDTH;
  moving.height = EQUIPMENT_HEIGHT;
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
    direction: number,
    sheetFrameRow: number,
  ) => {
    for (let visualRow = 0; visualRow < targetGroup.height; visualRow++) {
      for (let visualColumn = 0; visualColumn < targetGroup.width; visualColumn++) {
        tileContext.clearRect(0, 0, 32, 32);
        tileContext.drawImage(
          image,
          direction * blockWidth + visualColumn * 32,
          sheetFrameRow * blockHeight + visualRow * 32,
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
        const index = getSpriteIndex(targetGroup, frame, direction, tx, ty);
        if (index < targetGroup.sprites.length) assignSprite(targetGroup, index, tileData);
      }
    }
  };

  for (let direction = 0; direction < DIRECTION_COLUMNS; direction++) {
    for (let frame = 0; frame < idleFrames; frame++) {
      importFrame(idle, frame, direction, frame);
    }
    for (let frame = 0; frame < movingFrames; frame++) {
      importFrame(moving, frame, direction, idleFrames + frame);
    }
  }

  thing.rawBytes = undefined;
  return { idleFrames, movingFrames };
}
