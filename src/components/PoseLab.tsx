import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, RotateCcw } from 'lucide-react';
import { useOBStore } from '../store';
import { applyOutfitMask } from '../lib/outfit-colors';
import { decodeSprite } from '../lib/sprite-decoder';
import type { FrameGroup, SpriteData, ThingType } from '../lib/types';

type Direction = 0 | 1 | 2 | 3;
type Region = 0 | 1 | 2 | 3;
type EditTool = 'torso' | 'thigh' | 'shin' | 'erase' | 'hip' | 'knee' | 'ankle';

interface Point {
  x: number;
  y: number;
}

interface DirectionRig {
  sourceKey: string;
  width: number;
  height: number;
  hip: Point;
  knee: Point;
  ankle: Point;
  mask: Uint8Array;
}

interface PoseSettings {
  torsoAngle: number;
  hipAngle: number;
  kneeAngle: number;
  bendX: number;
  hipSplitOffset: number;
  kneeSplitOffset: number;
  lowerLegDrop: number;
  torsoLean: number;
  playerX: number;
  playerY: number;
  benchX: number;
  benchY: number;
  showOriginal: boolean;
  showMasks: boolean;
  showPivots: boolean;
}

const DEFAULT_SETTINGS: PoseSettings = {
  torsoAngle: 0,
  hipAngle: 0,
  kneeAngle: 0,
  bendX: 0,
  hipSplitOffset: 0,
  kneeSplitOffset: 0,
  lowerLegDrop: 0,
  torsoLean: 0,
  playerX: 0,
  playerY: 0,
  benchX: 0,
  benchY: 0,
  showOriginal: true,
  showMasks: false,
  showPivots: false,
};

const DIRECTION_LABELS = ['North', 'East', 'South', 'West'] as const;
const REGION_COLORS = {
  1: 'rgba(248, 113, 113, 0.58)',
  2: 'rgba(74, 222, 128, 0.58)',
  3: 'rgba(96, 165, 250, 0.58)',
} as const;

function frameSpriteIndex(
  frameGroup: FrameGroup,
  frame: number,
  patternX: number,
  patternY: number,
  patternZ: number,
  layer: number,
  tileX: number,
  tileY: number,
): number {
  return ((((((frame * frameGroup.patternZ + patternZ) * frameGroup.patternY + patternY)
    * frameGroup.patternX + patternX) * frameGroup.layers + layer)
    * frameGroup.height + tileY) * frameGroup.width + tileX);
}

function imageDataCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d')?.putImageData(imageData, 0, 0);
  return canvas;
}

function renderThing(
  thing: ThingType,
  spriteData: SpriteData,
  spriteOverrides: Map<number, ImageData>,
  direction: number,
  isOutfit: boolean,
): HTMLCanvasElement | null {
  const frameGroup = thing.frameGroups[0];
  if (!frameGroup || frameGroup.sprites.length === 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = frameGroup.width * 32;
  canvas.height = frameGroup.height * 32;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const patternX = Math.min(direction, frameGroup.patternX - 1);
  const renderedLayers = isOutfit && frameGroup.layers >= 2 ? 1 : frameGroup.layers;
  const defaultColors = { head: 0, body: 0, legs: 0, feet: 0 };
  let rendered = false;

  for (let layer = 0; layer < renderedLayers; layer++) {
    for (let tileY = 0; tileY < frameGroup.height; tileY++) {
      for (let tileX = 0; tileX < frameGroup.width; tileX++) {
        const index = frameSpriteIndex(
          frameGroup, 0, patternX, 0, 0, layer, tileX, tileY,
        );
        const spriteId = frameGroup.sprites[index] ?? 0;
        if (spriteId <= 0) continue;
        const raw = spriteOverrides.get(spriteId) ?? decodeSprite(spriteData, spriteId);
        if (!raw) continue;

        const imageData = new ImageData(new Uint8ClampedArray(raw.data), 32, 32);
        if (isOutfit && frameGroup.layers >= 2) {
          const maskIndex = frameSpriteIndex(
            frameGroup, 0, patternX, 0, 0, 1, tileX, tileY,
          );
          const maskSpriteId = frameGroup.sprites[maskIndex] ?? 0;
          const colorMask = maskSpriteId > 0
            ? spriteOverrides.get(maskSpriteId) ?? decodeSprite(spriteData, maskSpriteId)
            : null;
          if (colorMask) applyOutfitMask(imageData, colorMask, defaultColors);
        }

        const destinationX = (frameGroup.width - 1 - tileX) * 32;
        const destinationY = (frameGroup.height - 1 - tileY) * 32;
        context.drawImage(imageDataCanvas(imageData), destinationX, destinationY);
        rendered = true;
      }
    }
  }

  return rendered ? canvas : null;
}

function getOpaqueBounds(source: HTMLCanvasElement) {
  const data = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data;
  let left = source.width;
  let top = source.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      if (data[(y * source.width + x) * 4 + 3] === 0) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) {
    return { left: 0, top: 0, right: source.width - 1, bottom: source.height - 1 };
  }
  return { left, top, right, bottom };
}

function createAutomaticRig(source: HTMLCanvasElement, sourceKey: string): DirectionRig {
  const bounds = getOpaqueBounds(source);
  const bodyHeight = bounds.bottom - bounds.top + 1;
  const centerX = Math.round((bounds.left + bounds.right) / 2);
  const hipY = Math.round(bounds.top + bodyHeight * 0.52);
  const kneeY = Math.round(bounds.top + bodyHeight * 0.73);
  const ankleY = Math.round(bounds.top + bodyHeight * 0.91);
  const pixels = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data;
  const mask = new Uint8Array(source.width * source.height);

  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const index = y * source.width + x;
      if (pixels[index * 4 + 3] === 0) continue;
      mask[index] = y < hipY ? 1 : y < kneeY ? 2 : 3;
    }
  }

  return {
    sourceKey,
    width: source.width,
    height: source.height,
    hip: { x: centerX, y: hipY },
    knee: { x: centerX, y: kneeY },
    ankle: { x: centerX, y: ankleY },
    mask,
  };
}

function cloneRig(rig: DirectionRig): DirectionRig {
  return {
    ...rig,
    hip: { ...rig.hip },
    knee: { ...rig.knee },
    ankle: { ...rig.ankle },
    mask: new Uint8Array(rig.mask),
  };
}

function maskedSegment(
  source: HTMLCanvasElement,
  mask: Uint8Array,
  region: Region,
): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const sourceData = source.getContext('2d')!.getImageData(0, 0, source.width, source.height);
  const outputData = new ImageData(new Uint8ClampedArray(sourceData.data), source.width, source.height);

  for (let index = 0; index < mask.length; index++) {
    if (mask[index] === region) continue;
    outputData.data[index * 4 + 3] = 0;
  }
  output.getContext('2d')!.putImageData(outputData, 0, 0);
  return output;
}

function rotatePoint(point: Point, pivot: Point, angleDegrees: number): Point {
  const radians = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - pivot.x;
  const y = point.y - pivot.y;
  return {
    x: pivot.x + x * cosine - y * sine,
    y: pivot.y + x * sine + y * cosine,
  };
}

function drawRotatedSegment(
  context: CanvasRenderingContext2D,
  segment: HTMLCanvasElement,
  region: Region,
  rig: DirectionRig,
  settings: PoseSettings,
  sourcePivot: Point,
  destinationPivot: Point,
  angleDegrees: number,
  padding: number,
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  context.translate(padding + destinationPivot.x, padding + destinationPivot.y);
  context.rotate(angleDegrees * Math.PI / 180);
  context.translate(-sourcePivot.x, -sourcePivot.y);

  const hipY = Math.max(0, Math.min(segment.height - 1, rig.hip.y + settings.hipSplitOffset));
  const kneeY = Math.max(hipY + 1, Math.min(segment.height, rig.knee.y + settings.kneeSplitOffset));
  const bendStrength = Math.min(1, Math.abs(settings.bendX) / 32);
  const thighCompression = 1 - bendStrength * 0.82;

  for (let sourceY = 0; sourceY < segment.height; sourceY++) {
    let offsetX = 0;
    let destinationY = sourceY;

    if (region === 1 && sourceY < hipY) {
      const distanceFromHip = (hipY - sourceY) / Math.max(1, hipY);
      offsetX = -settings.torsoLean * distanceFromHip;
    } else if (region === 2) {
      const progress = Math.max(0, Math.min(1, (sourceY - hipY) / Math.max(1, kneeY - hipY)));
      offsetX = settings.bendX * progress;
      destinationY = hipY + (sourceY - hipY) * thighCompression;
    } else if (region === 3) {
      offsetX = settings.bendX;
      destinationY = sourceY + settings.lowerLegDrop;
    }

    context.drawImage(
      segment,
      0,
      sourceY,
      segment.width,
      1,
      Math.round(offsetX),
      Math.round(destinationY),
      segment.width,
      1,
    );
  }
  context.restore();
}

function renderRiggedOutfit(
  source: HTMLCanvasElement,
  rig: DirectionRig,
  settings: PoseSettings,
): HTMLCanvasElement {
  const padding = 72;
  const output = document.createElement('canvas');
  output.width = source.width + padding * 2;
  output.height = source.height + padding * 2;
  const context = output.getContext('2d')!;

  const torso = maskedSegment(source, rig.mask, 1);
  const thigh = maskedSegment(source, rig.mask, 2);
  const shin = maskedSegment(source, rig.mask, 3);

  const transformedKnee = rotatePoint(rig.knee, rig.hip, settings.hipAngle);
  const transformedAnkle = rotatePoint(
    rotatePoint(rig.ankle, rig.knee, settings.kneeAngle),
    rig.hip,
    settings.hipAngle,
  );

  drawRotatedSegment(context, torso, 1, rig, settings, rig.hip, rig.hip, settings.torsoAngle, padding);
  drawRotatedSegment(context, thigh, 2, rig, settings, rig.hip, rig.hip, settings.hipAngle, padding);
  drawRotatedSegment(
    context,
    shin,
    3,
    rig,
    settings,
    rig.knee,
    transformedKnee,
    settings.hipAngle + settings.kneeAngle,
    padding,
  );

  // Tiny pivot pixels make it easier to spot disconnected segments without
  // introducing smoothing or changing the source art.
  context.fillStyle = 'rgba(255,255,255,0.16)';
  context.fillRect(Math.round(padding + transformedKnee.x), Math.round(padding + transformedKnee.y), 1, 1);
  context.fillRect(Math.round(padding + transformedAnkle.x), Math.round(padding + transformedAnkle.y), 1, 1);
  return output;
}

function renderMaskOverlay(rig: DirectionRig): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = rig.width;
  canvas.height = rig.height;
  const context = canvas.getContext('2d')!;

  for (let y = 0; y < rig.height; y++) {
    for (let x = 0; x < rig.width; x++) {
      const region = rig.mask[y * rig.width + x] as Region;
      if (region === 0) continue;
      context.fillStyle = REGION_COLORS[region as 1 | 2 | 3];
      context.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function drawCheckerboard(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = '#171923';
  context.fillRect(0, 0, width, height);
  const size = 16;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      context.fillStyle = ((x / size + y / size) & 1) === 0 ? '#1d202c' : '#222634';
      context.fillRect(x, y, size, size);
    }
  }
  context.strokeStyle = 'rgba(255,255,255,0.055)';
  context.lineWidth = 1;
  for (let x = 0; x <= width; x += 32) {
    context.beginPath();
    context.moveTo(x + 0.5, 0);
    context.lineTo(x + 0.5, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 32) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
}

function drawPivot(
  context: CanvasRenderingContext2D,
  point: Point,
  origin: Point,
  color: string,
  label: string,
): void {
  const x = Math.round(origin.x + point.x);
  const y = Math.round(origin.y + point.y);
  context.fillStyle = '#11131b';
  context.fillRect(x - 3, y - 3, 7, 7);
  context.fillStyle = color;
  context.fillRect(x - 2, y - 2, 5, 5);
  context.font = '8px monospace';
  context.fillText(label, x + 5, y + 3);
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] text-emperia-muted">{label}</span>
      <input
        type="number"
        min={min}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-28 rounded border border-emperia-border bg-emperia-bg px-2 py-1 text-xs font-mono text-emperia-text"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between gap-4 text-[10px] text-emperia-muted">
        <span>{label}</span>
        <span className="font-mono text-emperia-text">{value}{suffix}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1 w-full accent-emperia-accent"
      />
    </label>
  );
}

export function PoseLab() {
  const objectData = useOBStore((state) => state.objectData);
  const spriteData = useOBStore((state) => state.spriteData);
  const spriteOverrides = useOBStore((state) => state.spriteOverrides);
  const editVersion = useOBStore((state) => state.editVersion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef(false);
  const [outfitId, setOutfitId] = useState(134);
  const [benchItemId, setBenchItemId] = useState(1662);
  const [direction, setDirection] = useState<Direction>(2);
  const [zoom, setZoom] = useState(3);
  const [brushSize, setBrushSize] = useState(3);
  const [editTool, setEditTool] = useState<EditTool>('thigh');
  const [settings, setSettings] = useState<PoseSettings>(DEFAULT_SETTINGS);
  const [rigs, setRigs] = useState<Array<DirectionRig | null>>([null, null, null, null]);
  const [copyStatus, setCopyStatus] = useState('');

  const resolved = useMemo(() => {
    if (!objectData || !spriteData) {
      return { outfit: null, bench: null, outfitError: '', benchError: '' };
    }

    const outfitAppearanceId = objectData.outfitAppearances.get(outfitId);
    const outfitInternalId = outfitAppearanceId == null
      ? null
      : objectData.itemCount + 1 + outfitAppearanceId;
    const outfitThing = outfitInternalId == null
      ? null
      : objectData.things.get(outfitInternalId) ?? null;

    const benchAppearanceId = objectData.itemAppearances.get(benchItemId);
    const benchThing = benchAppearanceId == null
      ? null
      : objectData.things.get(benchAppearanceId) ?? null;

    return {
      outfit: outfitThing
        ? renderThing(outfitThing, spriteData, spriteOverrides, direction, true)
        : null,
      bench: benchThing
        ? renderThing(benchThing, spriteData, spriteOverrides, 0, false)
        : null,
      outfitError: outfitThing ? '' : `Outfit ID ${outfitId} was not found in the loaded EOBJ.`,
      benchError: benchThing ? '' : `Item ID ${benchItemId} was not found in the loaded EOBJ.`,
    };
  }, [
    objectData,
    spriteData,
    spriteOverrides,
    editVersion,
    outfitId,
    benchItemId,
    direction,
  ]);

  const sourceKey = resolved.outfit
    ? `${outfitId}:${direction}:${resolved.outfit.width}x${resolved.outfit.height}`
    : '';
  const activeRig = rigs[direction];

  useEffect(() => {
    if (!resolved.outfit || !sourceKey) return;
    setRigs((current) => {
      if (current[direction]?.sourceKey === sourceKey) return current;
      const next = [...current];
      next[direction] = createAutomaticRig(resolved.outfit!, sourceKey);
      return next;
    });
  }, [resolved.outfit, sourceKey, direction]);

  const sceneGeometry = useMemo(() => {
    const anchorX = 160;
    const anchorY = Math.round(240 * 0.72);
    const originalX = resolved.outfit
      ? Math.round(anchorX - resolved.outfit.width / 2 + settings.playerX)
      : anchorX;
    const originalY = resolved.outfit
      ? Math.round(anchorY - resolved.outfit.height + settings.playerY)
      : anchorY;
    return { anchorX, anchorY, originalX, originalY };
  }, [resolved.outfit, settings.playerX, settings.playerY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.imageSmoothingEnabled = false;
    drawCheckerboard(context, canvas.width, canvas.height);

    if (resolved.bench) {
      context.drawImage(
        resolved.bench,
        Math.round(sceneGeometry.anchorX - resolved.bench.width / 2 + settings.benchX),
        Math.round(sceneGeometry.anchorY - resolved.bench.height + settings.benchY),
      );
    }

    if (!resolved.outfit || !activeRig || activeRig.sourceKey !== sourceKey) return;

    if (settings.showOriginal) {
      context.save();
      context.globalAlpha = 0.18;
      context.drawImage(resolved.outfit, sceneGeometry.originalX, sceneGeometry.originalY);
      context.restore();
    }

    const deformed = renderRiggedOutfit(resolved.outfit, activeRig, settings);
    context.drawImage(deformed, sceneGeometry.originalX - 72, sceneGeometry.originalY - 72);

    if (settings.showMasks) {
      const overlay = renderMaskOverlay(activeRig);
      context.drawImage(overlay, sceneGeometry.originalX, sceneGeometry.originalY);
    }
    if (settings.showPivots) {
      drawPivot(context, activeRig.hip, { x: sceneGeometry.originalX, y: sceneGeometry.originalY }, '#fbbf24', 'H');
      drawPivot(context, activeRig.knee, { x: sceneGeometry.originalX, y: sceneGeometry.originalY }, '#a78bfa', 'K');
      drawPivot(context, activeRig.ankle, { x: sceneGeometry.originalX, y: sceneGeometry.originalY }, '#22d3ee', 'A');
    }
  }, [resolved, activeRig, sourceKey, settings, sceneGeometry]);

  const updateSetting = <K extends keyof PoseSettings>(key: K, value: PoseSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateActiveRig = useCallback((mutate: (rig: DirectionRig) => void) => {
    setRigs((current) => {
      const rig = current[direction];
      if (!rig) return current;
      const next = [...current];
      const copy = cloneRig(rig);
      mutate(copy);
      next[direction] = copy;
      return next;
    });
  }, [direction]);

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas || !resolved.outfit || !activeRig) return null;
    const rect = canvas.getBoundingClientRect();
    const sceneX = (event.clientX - rect.left) * canvas.width / rect.width;
    const sceneY = (event.clientY - rect.top) * canvas.height / rect.height;
    const x = Math.floor(sceneX - sceneGeometry.originalX);
    const y = Math.floor(sceneY - sceneGeometry.originalY);
    if (x < 0 || y < 0 || x >= activeRig.width || y >= activeRig.height) return null;
    return { x, y };
  };

  const applyTool = (point: Point) => {
    if (!resolved.outfit || !activeRig) return;
    if (editTool === 'hip' || editTool === 'knee' || editTool === 'ankle') {
      updateActiveRig((rig) => {
        rig[editTool] = point;
      });
      return;
    }

    const sourcePixels = resolved.outfit.getContext('2d')!
      .getImageData(0, 0, resolved.outfit.width, resolved.outfit.height).data;
    const region: Region = editTool === 'torso'
      ? 1
      : editTool === 'thigh'
        ? 2
        : editTool === 'shin'
          ? 3
          : 0;
    const radius = Math.floor(brushSize / 2);

    updateActiveRig((rig) => {
      for (let y = point.y - radius; y <= point.y + radius; y++) {
        for (let x = point.x - radius; x <= point.x + radius; x++) {
          if (x < 0 || y < 0 || x >= rig.width || y >= rig.height) continue;
          if ((x - point.x) ** 2 + (y - point.y) ** 2 > radius ** 2 + 0.5) continue;
          const index = y * rig.width + x;
          if (region !== 0 && sourcePixels[index * 4 + 3] === 0) continue;
          rig.mask[index] = region;
        }
      }
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const isPivotTool = editTool === 'hip' || editTool === 'knee' || editTool === 'ankle';
    if (isPivotTool ? !settings.showPivots : !settings.showMasks) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintingRef.current = true;
    applyTool(point);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current || !settings.showMasks) return;
    if (editTool === 'hip' || editTool === 'knee' || editTool === 'ankle') return;
    const point = canvasPoint(event);
    if (point) applyTool(point);
  };

  const stopPainting = () => {
    paintingRef.current = false;
  };

  const resetCurrentRig = () => {
    if (!resolved.outfit) return;
    setRigs((current) => {
      const next = [...current];
      next[direction] = createAutomaticRig(resolved.outfit!, sourceKey);
      return next;
    });
  };

  const copyRigJson = async () => {
    if (!activeRig) return;
    const compactMask: Record<string, number[]> = { torso: [], thigh: [], shin: [] };
    activeRig.mask.forEach((region, index) => {
      if (region === 1) compactMask.torso.push(index);
      else if (region === 2) compactMask.thigh.push(index);
      else if (region === 3) compactMask.shin.push(index);
    });
    const payload = {
      outfitId,
      direction: DIRECTION_LABELS[direction].toLowerCase(),
      size: { width: activeRig.width, height: activeRig.height },
      pivots: { hip: activeRig.hip, knee: activeRig.knee, ankle: activeRig.ankle },
      pose: {
        torsoAngle: settings.torsoAngle,
        hipAngle: settings.hipAngle,
        kneeAngle: settings.kneeAngle,
        bendX: settings.bendX,
        hipSplitOffset: settings.hipSplitOffset,
        kneeSplitOffset: settings.kneeSplitOffset,
        lowerLegDrop: settings.lowerLegDrop,
        torsoLean: settings.torsoLean,
      },
      mask: compactMask,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed');
    }
    window.setTimeout(() => setCopyStatus(''), 1200);
  };

  const toolButton = (tool: EditTool, label: string, colorClass: string) => (
    <button
      type="button"
      onClick={() => {
        setEditTool(tool);
        const isPivotTool = tool === 'hip' || tool === 'knee' || tool === 'ankle';
        if (isPivotTool && !settings.showPivots) updateSetting('showPivots', true);
        if (!isPivotTool && !settings.showMasks) updateSetting('showMasks', true);
      }}
      className={`rounded border px-2 py-1 text-[10px] transition-colors ${
        editTool === tool
          ? `${colorClass} border-current`
          : 'border-emperia-border text-emperia-muted hover:bg-emperia-hover'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-[600px]">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-emperia-border p-3">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-emperia-text">Seated Pose Lab</h2>
            <p className="mt-1 text-[10px] leading-relaxed text-emperia-muted">
              Directional cutout rig preview. Nothing is written to EOBJ or ESPR.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSettings(DEFAULT_SETTINGS);
              resetCurrentRig();
            }}
            title="Reset pose and current direction rig"
            className="rounded border border-emperia-border p-1.5 text-emperia-muted transition-colors hover:bg-emperia-hover hover:text-emperia-text"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3 border-b border-emperia-border pb-4">
          <NumberField label="Base outfit ID" value={outfitId} onChange={setOutfitId} min={1} />
          <NumberField label="Bench item ID" value={benchItemId} onChange={setBenchItemId} min={1} />
        </div>

        <div className="mb-4">
          <span className="mb-1.5 block text-[10px] text-emperia-muted">Direction-specific rig</span>
          <div className="grid grid-cols-4 gap-1">
            {DIRECTION_LABELS.map((label, index) => (
              <button
                type="button"
                key={label}
                onClick={() => setDirection(index as Direction)}
                title={label}
                className={`rounded border px-1 py-1 text-[10px] transition-colors ${
                  direction === index
                    ? 'border-emperia-accent bg-emperia-accent/15 text-emperia-accent'
                    : 'border-emperia-border text-emperia-muted hover:bg-emperia-hover'
                }`}
              >
                {label[0]}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 border-b border-emperia-border pb-4">
          <Slider label="Torso angle" value={settings.torsoAngle} min={-45} max={45} suffix="°"
            onChange={(value) => updateSetting('torsoAngle', value)} />
          <Slider label="Hip angle" value={settings.hipAngle} min={-120} max={120} suffix="°"
            onChange={(value) => updateSetting('hipAngle', value)} />
          <Slider label="Knee angle" value={settings.kneeAngle} min={-140} max={140} suffix="°"
            onChange={(value) => updateSetting('kneeAngle', value)} />
        </div>

        <div className="mb-4 flex flex-col gap-3 border-b border-emperia-border pb-4">
          <div>
            <span className="text-[10px] font-medium text-emperia-text">Classic warp</span>
            <p className="mt-0.5 text-[9px] text-emperia-muted/70">
              Original scanline controls, combined with the cutout rig.
            </p>
          </div>
          <Slider label="Side bend" value={settings.bendX} min={-40} max={40} suffix=" px"
            onChange={(value) => updateSetting('bendX', value)} />
          <Slider label="Hip split" value={settings.hipSplitOffset} min={-24} max={24} suffix=" px"
            onChange={(value) => updateSetting('hipSplitOffset', value)} />
          <Slider label="Knee split" value={settings.kneeSplitOffset} min={-24} max={24} suffix=" px"
            onChange={(value) => updateSetting('kneeSplitOffset', value)} />
          <Slider label="Lower-leg drop" value={settings.lowerLegDrop} min={-24} max={24} suffix=" px"
            onChange={(value) => updateSetting('lowerLegDrop', value)} />
          <Slider label="Torso lean" value={settings.torsoLean} min={-20} max={20} suffix=" px"
            onChange={(value) => updateSetting('torsoLean', value)} />
        </div>

        <div className="mb-4 border-b border-emperia-border pb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium text-emperia-text">Mask & pivots</span>
            <button
              type="button"
              onClick={resetCurrentRig}
              className="text-[9px] text-emperia-muted hover:text-emperia-accent"
            >
              Auto reset
            </button>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-1">
            {toolButton('torso', 'Torso', 'bg-red-400/15 text-red-300')}
            {toolButton('thigh', 'Thigh', 'bg-green-400/15 text-green-300')}
            {toolButton('shin', 'Shin / feet', 'bg-blue-400/15 text-blue-300')}
            {toolButton('erase', 'Erase', 'bg-emperia-hover text-emperia-text')}
          </div>
          <div className="mb-3 grid grid-cols-3 gap-1">
            {toolButton('hip', 'Hip pivot', 'bg-amber-400/15 text-amber-300')}
            {toolButton('knee', 'Knee pivot', 'bg-violet-400/15 text-violet-300')}
            {toolButton('ankle', 'Ankle', 'bg-cyan-400/15 text-cyan-300')}
          </div>
          <Slider label="Brush size" value={brushSize} min={1} max={11} suffix=" px" onChange={setBrushSize} />
          <p className="mt-2 text-[9px] leading-relaxed text-emperia-muted/70">
            Mask tools paint on the original ghost. Pivot tools place one point per click. Their visibility is controlled separately below.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Slider label="Player X" value={settings.playerX} min={-64} max={64} suffix=" px"
            onChange={(value) => updateSetting('playerX', value)} />
          <Slider label="Player Y" value={settings.playerY} min={-64} max={64} suffix=" px"
            onChange={(value) => updateSetting('playerY', value)} />
          <Slider label="Bench X" value={settings.benchX} min={-64} max={64} suffix=" px"
            onChange={(value) => updateSetting('benchX', value)} />
          <Slider label="Bench Y" value={settings.benchY} min={-64} max={64} suffix=" px"
            onChange={(value) => updateSetting('benchY', value)} />
          <Slider label="Preview zoom" value={zoom} min={1} max={6} suffix="x" onChange={setZoom} />
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-emperia-muted">
            <input
              type="checkbox"
              checked={settings.showOriginal}
              onChange={(event) => updateSetting('showOriginal', event.target.checked)}
              className="accent-emperia-accent"
            />
            Show original pose as ghost
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-emperia-muted">
            <input
              type="checkbox"
              checked={settings.showMasks}
              onChange={(event) => updateSetting('showMasks', event.target.checked)}
              className="accent-emperia-accent"
            />
            Show and edit masks
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-[10px] text-emperia-muted">
            <input
              type="checkbox"
              checked={settings.showPivots}
              onChange={(event) => updateSetting('showPivots', event.target.checked)}
              className="accent-emperia-accent"
            />
            Show and edit pivots
          </label>
          <button
            type="button"
            onClick={copyRigJson}
            disabled={!activeRig}
            className="flex items-center justify-center gap-1.5 rounded border border-emperia-border px-2 py-1.5 text-[10px] text-emperia-muted transition-colors hover:bg-emperia-hover hover:text-emperia-text disabled:opacity-40"
          >
            <Copy className="h-3 w-3" />
            {copyStatus || 'Copy rig JSON'}
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center overflow-auto p-4">
        {(resolved.outfitError || resolved.benchError) && (
          <div className="mb-3 w-full max-w-3xl rounded border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-300">
            {resolved.outfitError && <div>{resolved.outfitError}</div>}
            {resolved.benchError && <div>{resolved.benchError}</div>}
          </div>
        )}

        <div className="flex flex-1 items-center justify-center">
          <div className="checkerboard rounded-lg border border-emperia-border p-2 shadow-2xl">
            <canvas
              ref={canvasRef}
              width={320}
              height={240}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopPainting}
              onPointerCancel={stopPainting}
              onPointerLeave={stopPainting}
              className={settings.showMasks || settings.showPivots ? 'block cursor-crosshair touch-none' : 'block'}
              style={{
                width: 320 * zoom,
                height: 240 * zoom,
                imageRendering: 'pixelated',
              }}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-[10px] text-emperia-muted">
          <span><span className="text-red-300">■</span> Torso</span>
          <span><span className="text-green-300">■</span> Thigh</span>
          <span><span className="text-blue-300">■</span> Shin / feet</span>
          <span>Base body · frame 0 · {DIRECTION_LABELS[direction]}</span>
        </div>
      </main>
    </div>
  );
}
