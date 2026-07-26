import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, MousePointer2, RotateCcw, Save, Upload } from 'lucide-react';
import { useOBStore } from '../store';
import { HelpTooltip } from './HelpTooltip';
import { applyOutfitMask } from '../lib/outfit-colors';
import { decodeSprite } from '../lib/sprite-decoder';
import {
  poseSetProfileKey,
  type FrameGroup,
  type SeatDirection,
  type SeatPoseProfile,
  type PoseSegmentTransform,
  type PoseAction,
  type BodyPartId,
  type AnatomicalRig,
  type SpriteData,
  type ThingType,
} from '../lib/types';

type Direction = 0 | 1 | 2 | 3;
type Region = 0 | 1 | 2 | 3 | 4 | 5;
type EditTool = 'torso' | 'thigh' | 'shin' | 'locked' | 'hidden' | 'erase' | 'hip' | 'knee' | 'ankle';
type PoseSegment = 'torso' | 'thigh' | 'shin';

interface Point {
  x: number;
  y: number;
}

interface PivotLine {
  start: Point;
  end: Point;
}

interface DirectionRig {
  sourceKey: string;
  width: number;
  height: number;
  hip: Point;
  knee: Point;
  ankle: Point;
  hipLine?: PivotLine;
  kneeLine?: PivotLine;
  ankleLine?: PivotLine;
  mask: Uint8Array;
  anatomyMask: Uint8Array;
  anatomyAnchors: Partial<Record<BodyPartId, Point>>;
}

interface BodyPartTransform {
  rotation: number;
  offset: Point;
  visible: boolean;
}

interface PoseSettings {
  torsoAngle: number;
  hipAngle: number;
  kneeAngle: number;
  bendX: number;
  shinBend: number;
  hipSplitOffset: number;
  kneeSplitOffset: number;
  torsoDrop: number;
  thighDrop: number;
  lowerLegDrop: number;
  torsoCut?: Point;
  thighCut?: Point;
  shinCut?: Point;
  segmentOrder?: PoseSegment[];
  segmentVisibility?: Partial<Record<PoseSegment, boolean>>;
  segmentTransforms: Record<PoseSegment, PoseSegmentTransform>;
  torsoLean: number;
  playerX: number;
  playerY: number;
  benchX: number;
  benchY: number;
  showMasks: boolean;
  showPivots: boolean;
  anatomyEnabled: boolean;
  anatomyTransforms: Record<BodyPartId, BodyPartTransform>;
  anatomyParents: Record<BodyPartId, BodyPartId | null>;
  anatomyOrder: BodyPartId[];
}

const BODY_PARTS: ReadonlyArray<{
  id: BodyPartId;
  label: string;
  shortLabel: string;
  parentId: BodyPartId | null;
  color: string;
}> = [
  { id: 'torso', label: 'Torso', shortLabel: 'Torso', parentId: null, color: '#f87171' },
  { id: 'head', label: 'Head', shortLabel: 'Head', parentId: 'torso', color: '#f9a8d4' },
  { id: 'upper-arm-left', label: 'Left upper arm', shortLabel: 'L upper arm', parentId: 'torso', color: '#fb923c' },
  { id: 'upper-arm-right', label: 'Right upper arm', shortLabel: 'R upper arm', parentId: 'torso', color: '#a3e635' },
  { id: 'forearm-left', label: 'Left forearm', shortLabel: 'L forearm', parentId: 'upper-arm-left', color: '#facc15' },
  { id: 'forearm-right', label: 'Right forearm', shortLabel: 'R forearm', parentId: 'upper-arm-right', color: '#4ade80' },
  { id: 'hand-left', label: 'Left hand', shortLabel: 'L hand', parentId: 'forearm-left', color: '#fde68a' },
  { id: 'hand-right', label: 'Right hand', shortLabel: 'R hand', parentId: 'forearm-right', color: '#6ee7b7' },
  { id: 'thigh-left', label: 'Left thigh', shortLabel: 'L thigh', parentId: 'torso', color: '#22d3ee' },
  { id: 'thigh-right', label: 'Right thigh', shortLabel: 'R thigh', parentId: 'torso', color: '#a78bfa' },
  { id: 'shin-left', label: 'Left shin', shortLabel: 'L shin', parentId: 'thigh-left', color: '#60a5fa' },
  { id: 'shin-right', label: 'Right shin', shortLabel: 'R shin', parentId: 'thigh-right', color: '#c084fc' },
  { id: 'foot-left', label: 'Left foot', shortLabel: 'L foot', parentId: 'shin-left', color: '#818cf8' },
  { id: 'foot-right', label: 'Right foot', shortLabel: 'R foot', parentId: 'shin-right', color: '#e879f9' },
];

const BODY_PART_INDEX = new Map(BODY_PARTS.map((part, index) => [part.id, index + 1]));
const BODY_PART_BY_ID = new Map(BODY_PARTS.map((part) => [part.id, part]));

function createDefaultAnatomyTransforms(): Record<BodyPartId, BodyPartTransform> {
  return Object.fromEntries(BODY_PARTS.map((part) => [
    part.id,
    { rotation: 0, offset: { x: 0, y: 0 }, visible: true },
  ])) as Record<BodyPartId, BodyPartTransform>;
}

function createDefaultAnatomyParents(): Record<BodyPartId, BodyPartId | null> {
  return Object.fromEntries(BODY_PARTS.map((part) => [
    part.id,
    part.parentId,
  ])) as Record<BodyPartId, BodyPartId | null>;
}

const DEFAULT_SETTINGS: PoseSettings = {
  torsoAngle: 0,
  hipAngle: 0,
  kneeAngle: 0,
  bendX: 0,
  shinBend: 0,
  hipSplitOffset: 0,
  kneeSplitOffset: 0,
  torsoDrop: 0,
  thighDrop: 0,
  lowerLegDrop: 0,
  torsoCut: { x: 0, y: 0 },
  thighCut: { x: 0, y: 0 },
  shinCut: { x: 0, y: 0 },
  segmentOrder: ['torso', 'thigh', 'shin'],
  segmentVisibility: { torso: true, thigh: true, shin: true },
  segmentTransforms: {
    torso: { translate: { x: 0, y: 0 }, scale: { x: 100, y: 100 }, skew: { x: 0, y: 0 } },
    thigh: { translate: { x: 0, y: 0 }, scale: { x: 100, y: 100 }, skew: { x: 0, y: 0 } },
    shin: { translate: { x: 0, y: 0 }, scale: { x: 100, y: 100 }, skew: { x: 0, y: 0 } },
  },
  torsoLean: 0,
  playerX: 0,
  playerY: 0,
  benchX: 0,
  benchY: 0,
  showMasks: true,
  showPivots: true,
  anatomyEnabled: false,
  anatomyTransforms: createDefaultAnatomyTransforms(),
  anatomyParents: createDefaultAnatomyParents(),
  anatomyOrder: BODY_PARTS.map((part) => part.id),
};

const DIRECTION_LABELS = ['North', 'East', 'South', 'West'] as const;
const DIRECTION_ARROWS = ['↑', '→', '↓', '←'] as const;
const DEFAULT_SEGMENT_ORDER: PoseSegment[] = ['torso', 'thigh', 'shin'];
const SEGMENT_LABELS: Record<PoseSegment, string> = {
  torso: 'Torso',
  thigh: 'Thigh',
  shin: 'Shin / feet',
};
const REGION_COLORS = {
  1: 'rgba(248, 113, 113, 0.58)',
  2: 'rgba(74, 222, 128, 0.58)',
  3: 'rgba(96, 165, 250, 0.58)',
  4: 'rgba(250, 204, 21, 0.7)',
  5: 'rgba(244, 63, 94, 0.78)',
} as const;

function isHorizontalDirection(direction: Direction): boolean {
  return direction === 1 || direction === 3;
}

type JointName = 'hip' | 'knee' | 'ankle';

function getPivotLine(
  rig: DirectionRig,
  joint: JointName,
  direction: Direction,
): PivotLine {
  const stored = rig[`${joint}Line` as `${JointName}Line`];
  if (stored) return stored;

  const point = rig[joint];
  return isHorizontalDirection(direction)
    ? {
        start: { x: point.x, y: 0 },
        end: { x: point.x, y: rig.height - 1 },
      }
    : {
        start: { x: 0, y: point.y },
        end: { x: rig.width - 1, y: point.y },
      };
}

function lineMidpoint(line: PivotLine): Point {
  return {
    x: (line.start.x + line.end.x) / 2,
    y: (line.start.y + line.end.y) / 2,
  };
}

function lineAxisAt(line: PivotLine, crossAxis: number, horizontal: boolean): number {
  const crossStart = horizontal ? line.start.y : line.start.x;
  const crossEnd = horizontal ? line.end.y : line.end.x;
  const axisStart = horizontal ? line.start.x : line.start.y;
  const axisEnd = horizontal ? line.end.x : line.end.y;
  const span = crossEnd - crossStart;
  if (Math.abs(span) < 0.001) return (axisStart + axisEnd) / 2;
  const progress = Math.max(0, Math.min(1, (crossAxis - crossStart) / span));
  return axisStart + (axisEnd - axisStart) * progress;
}

function setRigPivotLine(rig: DirectionRig, joint: JointName, line: PivotLine): void {
  if (joint === 'hip') rig.hipLine = line;
  else if (joint === 'knee') rig.kneeLine = line;
  else rig.ankleLine = line;
  rig[joint] = lineMidpoint(line);
}

function getSegmentCut(
  settings: PoseSettings,
  region: 1 | 2 | 3,
  direction: Direction,
): Point {
  const cut = region === 1
    ? settings.torsoCut
    : region === 2
      ? settings.thighCut
      : settings.shinCut;
  if (cut) return cut;

  // Migrate Pose Lab state kept alive by hot reload. The former drop control
  // moved on the longitudinal axis: Y for South-style rigs and X for East.
  const oldDrop = region === 1
    ? settings.torsoDrop ?? 0
    : region === 2
      ? settings.thighDrop ?? 0
      : settings.lowerLegDrop ?? 0;
  return isHorizontalDirection(direction) ? { x: oldDrop, y: 0 } : { x: 0, y: oldDrop };
}

function getSegmentOrder(settings: PoseSettings): PoseSegment[] {
  const configured = settings.segmentOrder ?? DEFAULT_SEGMENT_ORDER;
  const order = configured.filter(
    (segment, index): segment is PoseSegment =>
      DEFAULT_SEGMENT_ORDER.includes(segment) && configured.indexOf(segment) === index,
  );
  for (const segment of DEFAULT_SEGMENT_ORDER) {
    if (!order.includes(segment)) order.push(segment);
  }
  return order;
}

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

function createAutomaticRig(
  source: HTMLCanvasElement,
  sourceKey: string,
  direction: Direction,
): DirectionRig {
  const bounds = getOpaqueBounds(source);
  const horizontal = isHorizontalDirection(direction);
  const bodyLength = horizontal
    ? bounds.right - bounds.left + 1
    : bounds.bottom - bounds.top + 1;
  const centerX = Math.round((bounds.left + bounds.right) / 2);
  const centerY = Math.round((bounds.top + bounds.bottom) / 2);
  const hipAxis = Math.round((horizontal ? bounds.left : bounds.top) + bodyLength * 0.52);
  const kneeAxis = Math.round((horizontal ? bounds.left : bounds.top) + bodyLength * 0.73);
  const ankleAxis = Math.round((horizontal ? bounds.left : bounds.top) + bodyLength * 0.91);
  // Zero means "automatic anatomical region". Keep the generated mask empty
  // so moving either pivot line immediately recalculates torso/thigh/shin.
  const mask = new Uint8Array(source.width * source.height);

  return {
    sourceKey,
    width: source.width,
    height: source.height,
    hip: horizontal ? { x: hipAxis, y: centerY } : { x: centerX, y: hipAxis },
    knee: horizontal ? { x: kneeAxis, y: centerY } : { x: centerX, y: kneeAxis },
    ankle: horizontal ? { x: ankleAxis, y: centerY } : { x: centerX, y: ankleAxis },
    hipLine: horizontal
      ? { start: { x: hipAxis, y: bounds.top }, end: { x: hipAxis, y: bounds.bottom } }
      : { start: { x: bounds.left, y: hipAxis }, end: { x: bounds.right, y: hipAxis } },
    kneeLine: horizontal
      ? { start: { x: kneeAxis, y: bounds.top }, end: { x: kneeAxis, y: bounds.bottom } }
      : { start: { x: bounds.left, y: kneeAxis }, end: { x: bounds.right, y: kneeAxis } },
    ankleLine: horizontal
      ? { start: { x: ankleAxis, y: bounds.top }, end: { x: ankleAxis, y: bounds.bottom } }
      : { start: { x: bounds.left, y: ankleAxis }, end: { x: bounds.right, y: ankleAxis } },
    mask,
    anatomyMask: new Uint8Array(source.width * source.height),
    anatomyAnchors: {},
  };
}

function cloneRig(rig: DirectionRig): DirectionRig {
  return {
    ...rig,
    hip: { ...rig.hip },
    knee: { ...rig.knee },
    ankle: { ...rig.ankle },
    hipLine: rig.hipLine
      ? { start: { ...rig.hipLine.start }, end: { ...rig.hipLine.end } }
      : undefined,
    kneeLine: rig.kneeLine
      ? { start: { ...rig.kneeLine.start }, end: { ...rig.kneeLine.end } }
      : undefined,
    ankleLine: rig.ankleLine
      ? { start: { ...rig.ankleLine.start }, end: { ...rig.ankleLine.end } }
      : undefined,
    mask: new Uint8Array(rig.mask),
    anatomyMask: new Uint8Array(rig.anatomyMask),
    anatomyAnchors: Object.fromEntries(
      Object.entries(rig.anatomyAnchors).map(([id, point]) => [id, point ? { ...point } : point]),
    ),
  };
}

function maskedSegment(
  source: HTMLCanvasElement,
  mask: Uint8Array,
  region: number,
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

interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

const IDENTITY_MATRIX: Matrix2D = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const RIG_CONTROL_CANVAS_SIZE = 96;

function multiplyMatrix(parent: Matrix2D, local: Matrix2D): Matrix2D {
  return {
    a: parent.a * local.a + parent.c * local.b,
    b: parent.b * local.a + parent.d * local.b,
    c: parent.a * local.c + parent.c * local.d,
    d: parent.b * local.c + parent.d * local.d,
    tx: parent.a * local.tx + parent.c * local.ty + parent.tx,
    ty: parent.b * local.tx + parent.d * local.ty + parent.ty,
  };
}

function bodyPartLocalMatrix(anchor: Point, transform: BodyPartTransform): Matrix2D {
  const radians = transform.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    a: cosine,
    b: sine,
    c: -sine,
    d: cosine,
    tx: anchor.x + transform.offset.x - cosine * anchor.x + sine * anchor.y,
    ty: anchor.y + transform.offset.y - sine * anchor.x - cosine * anchor.y,
  };
}

function transformMatrixPoint(point: Point, matrix: Matrix2D): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.tx,
    y: matrix.b * point.x + matrix.d * point.y + matrix.ty,
  };
}

function invertMatrix(matrix: Matrix2D): Matrix2D | null {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 0.000001) return null;
  const inverseDeterminant = 1 / determinant;
  return {
    a: matrix.d * inverseDeterminant,
    b: -matrix.b * inverseDeterminant,
    c: -matrix.c * inverseDeterminant,
    d: matrix.a * inverseDeterminant,
    tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) * inverseDeterminant,
    ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) * inverseDeterminant,
  };
}

function clipPolygon(
  polygon: Point[],
  inside: (point: Point) => boolean,
  intersect: (start: Point, end: Point) => Point,
): Point[] {
  if (polygon.length === 0) return polygon;
  const output: Point[] = [];
  let start = polygon[polygon.length - 1];
  let startInside = inside(start);
  for (const end of polygon) {
    const endInside = inside(end);
    if (endInside !== startInside) output.push(intersect(start, end));
    if (endInside) output.push(end);
    start = end;
    startInside = endInside;
  }
  return output;
}

function polygonCellCoverage(polygon: Point[], x: number, y: number): number {
  let clipped = clipPolygon(
    polygon,
    (point) => point.x >= x,
    (start, end) => {
      const ratio = (x - start.x) / (end.x - start.x);
      return { x, y: start.y + (end.y - start.y) * ratio };
    },
  );
  clipped = clipPolygon(
    clipped,
    (point) => point.x <= x + 1,
    (start, end) => {
      const edge = x + 1;
      const ratio = (edge - start.x) / (end.x - start.x);
      return { x: edge, y: start.y + (end.y - start.y) * ratio };
    },
  );
  clipped = clipPolygon(
    clipped,
    (point) => point.y >= y,
    (start, end) => {
      const ratio = (y - start.y) / (end.y - start.y);
      return { x: start.x + (end.x - start.x) * ratio, y };
    },
  );
  clipped = clipPolygon(
    clipped,
    (point) => point.y <= y + 1,
    (start, end) => {
      const edge = y + 1;
      const ratio = (edge - start.y) / (end.y - start.y);
      return { x: start.x + (end.x - start.x) * ratio, y: edge };
    },
  );
  if (clipped.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < clipped.length; index++) {
    const current = clipped[index];
    const next = clipped[(index + 1) % clipped.length];
    twiceArea += current.x * next.y - next.x * current.y;
  }
  return Math.abs(twiceArea) / 2;
}

function forEachCoveragePreservingSample(
  mask: Uint8Array,
  region: number,
  matrix: Matrix2D,
  width: number,
  height: number,
  visit: (destinationX: number, destinationY: number, sourceX: number, sourceY: number) => void,
): void {
  const destinations = new Map<string, {
    x: number;
    y: number;
    sourceX: number;
    sourceY: number;
    totalCoverage: number;
    bestCoverage: number;
  }>();
  const requiredDestinations = new Set<string>();

  for (let sourceY = 0; sourceY < height; sourceY++) {
    for (let sourceX = 0; sourceX < width; sourceX++) {
      if (mask[sourceY * width + sourceX] !== region) continue;
      const polygon = [
        transformMatrixPoint({ x: sourceX, y: sourceY }, matrix),
        transformMatrixPoint({ x: sourceX + 1, y: sourceY }, matrix),
        transformMatrixPoint({ x: sourceX + 1, y: sourceY + 1 }, matrix),
        transformMatrixPoint({ x: sourceX, y: sourceY + 1 }, matrix),
      ];
      const left = Math.floor(Math.min(...polygon.map((point) => point.x)));
      const top = Math.floor(Math.min(...polygon.map((point) => point.y)));
      const right = Math.ceil(Math.max(...polygon.map((point) => point.x)));
      const bottom = Math.ceil(Math.max(...polygon.map((point) => point.y)));
      let strongestKey = '';
      let strongestCoverage = 0;

      for (let destinationY = top; destinationY < bottom; destinationY++) {
        for (let destinationX = left; destinationX < right; destinationX++) {
          const coverage = polygonCellCoverage(polygon, destinationX, destinationY);
          if (coverage <= 0.0001) continue;
          const key = `${destinationX},${destinationY}`;
          const existing = destinations.get(key);
          if (existing) {
            existing.totalCoverage += coverage;
            if (coverage > existing.bestCoverage) {
              existing.sourceX = sourceX;
              existing.sourceY = sourceY;
              existing.bestCoverage = coverage;
            }
          } else {
            destinations.set(key, {
              x: destinationX,
              y: destinationY,
              sourceX,
              sourceY,
              totalCoverage: coverage,
              bestCoverage: coverage,
            });
          }
          if (coverage > strongestCoverage) {
            strongestCoverage = coverage;
            strongestKey = key;
          }
        }
      }
      if (strongestKey) requiredDestinations.add(strongestKey);
    }
  }

  for (const [key, destination] of destinations) {
    // Normal cells need meaningful source coverage. The strongest destination
    // for every source pixel is kept as well, so one-pixel limbs cannot vanish.
    if (destination.totalCoverage < 0.35 && !requiredDestinations.has(key)) continue;
    visit(
      destination.x,
      destination.y,
      destination.sourceX,
      destination.sourceY,
    );
  }
}

function getBodyPartMatrices(
  rig: DirectionRig,
  settings: PoseSettings,
): Map<BodyPartId, Matrix2D> {
  const matrices = new Map<BodyPartId, Matrix2D>();
  const resolving = new Set<BodyPartId>();
  const resolve = (id: BodyPartId): Matrix2D => {
    const cached = matrices.get(id);
    if (cached) return cached;
    if (resolving.has(id)) return IDENTITY_MATRIX;
    resolving.add(id);
    const parentId = settings.anatomyParents?.[id] ?? BODY_PART_BY_ID.get(id)?.parentId ?? null;
    const parent = parentId ? resolve(parentId) : IDENTITY_MATRIX;
    const anchor = rig.anatomyAnchors[id] ?? { x: rig.width / 2, y: rig.height / 2 };
    const transform = settings.anatomyTransforms?.[id]
      ?? { rotation: 0, offset: { x: 0, y: 0 }, visible: true };
    const result = multiplyMatrix(parent, bodyPartLocalMatrix(anchor, transform));
    resolving.delete(id);
    matrices.set(id, result);
    return result;
  };
  for (const part of BODY_PARTS) resolve(part.id);
  return matrices;
}

function renderAnatomicalOutfit(
  source: HTMLCanvasElement,
  rig: DirectionRig,
  settings: PoseSettings,
  padding: number,
): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = source.width + padding * 2;
  output.height = source.height + padding * 2;
  const context = output.getContext('2d')!;
  context.imageSmoothingEnabled = false;
  const sourcePixels = source.getContext('2d')!
    .getImageData(0, 0, source.width, source.height);
  const outputPixels = context.createImageData(output.width, output.height);
  const copyPixel = (
    destinationX: number,
    destinationY: number,
    sourceX: number,
    sourceY: number,
  ) => {
    const outputX = destinationX + padding;
    const outputY = destinationY + padding;
    if (outputX < 0 || outputY < 0 || outputX >= output.width || outputY >= output.height) return;
    const sourceIndex = (sourceY * source.width + sourceX) * 4;
    const destinationIndex = (outputY * output.width + outputX) * 4;
    outputPixels.data[destinationIndex] = sourcePixels.data[sourceIndex];
    outputPixels.data[destinationIndex + 1] = sourcePixels.data[sourceIndex + 1];
    outputPixels.data[destinationIndex + 2] = sourcePixels.data[sourceIndex + 2];
    outputPixels.data[destinationIndex + 3] = sourcePixels.data[sourceIndex + 3];
  };

  for (let index = 0; index < rig.anatomyMask.length; index++) {
    if (rig.anatomyMask[index] !== 0) continue;
    copyPixel(index % source.width, Math.floor(index / source.width), index % source.width, Math.floor(index / source.width));
  }

  const matrices = getBodyPartMatrices(rig, settings);
  const order = settings.anatomyOrder?.length > 0
    ? settings.anatomyOrder
    : BODY_PARTS.map((part) => part.id);
  for (const id of order) {
    const transform = settings.anatomyTransforms[id];
    if (transform?.visible === false) continue;
    const region = BODY_PART_INDEX.get(id);
    const matrix = matrices.get(id);
    if (!region || !matrix) continue;
    forEachCoveragePreservingSample(
      rig.anatomyMask,
      region,
      matrix,
      source.width,
      source.height,
      copyPixel,
    );
  }
  context.putImageData(outputPixels, 0, 0);
  return output;
}

function completeMaskForPreview(
  source: HTMLCanvasElement,
  rig: DirectionRig,
  direction: Direction,
): Uint8Array {
  const completed = new Uint8Array(rig.mask);
  const pixels = source.getContext('2d')!
    .getImageData(0, 0, source.width, source.height).data;
  const horizontal = isHorizontalDirection(direction);
  const hipLine = getPivotLine(rig, 'hip', direction);
  const kneeLine = getPivotLine(rig, 'knee', direction);

  for (let index = 0; index < completed.length; index++) {
    if (completed[index] !== 0 || pixels[index * 4 + 3] === 0) continue;
    const x = index % source.width;
    const y = Math.floor(index / source.width);
    const axis = horizontal ? x : y;
    const crossAxis = horizontal ? y : x;
    const hipAxis = lineAxisAt(hipLine, crossAxis, horizontal);
    const kneeAxis = lineAxisAt(kneeLine, crossAxis, horizontal);
    completed[index] = axis < hipAxis ? 1 : axis < kneeAxis ? 2 : 3;
  }
  return completed;
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

function getSegmentTransform(
  settings: PoseSettings,
  segment: PoseSegment,
): PoseSegmentTransform {
  return settings.segmentTransforms?.[segment] ?? {
    translate: { x: 0, y: 0 },
    scale: { x: 100, y: 100 },
    skew: { x: 0, y: 0 },
  };
}

function transformSegmentPoint(
  point: Point,
  sourcePivot: Point,
  destinationPivot: Point,
  angleDegrees: number,
  transform: PoseSegmentTransform,
): Point {
  const relativeX = point.x - sourcePivot.x;
  const relativeY = point.y - sourcePivot.y;
  const scaleX = transform.scale.x / 100;
  const scaleY = transform.scale.y / 100;
  const skewX = Math.tan(transform.skew.x * Math.PI / 180);
  const skewY = Math.tan(transform.skew.y * Math.PI / 180);
  const affineX = relativeX * scaleX + relativeY * skewX;
  const affineY = relativeX * skewY + relativeY * scaleY;
  const radians = angleDegrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: destinationPivot.x + transform.translate.x + affineX * cosine - affineY * sine,
    y: destinationPivot.y + transform.translate.y + affineX * sine + affineY * cosine,
  };
}

function drawRotatedSegment(
  context: CanvasRenderingContext2D,
  segment: HTMLCanvasElement,
  region: 1 | 2 | 3,
  rig: DirectionRig,
  settings: PoseSettings,
  sourcePivot: Point,
  destinationPivot: Point,
  angleDegrees: number,
  padding: number,
  direction: Direction,
): void {
  context.save();
  context.imageSmoothingEnabled = false;
  const segmentName: PoseSegment = region === 1 ? 'torso' : region === 2 ? 'thigh' : 'shin';
  const transform = getSegmentTransform(settings, segmentName);
  context.translate(
    padding + destinationPivot.x + transform.translate.x,
    padding + destinationPivot.y + transform.translate.y,
  );
  context.rotate(angleDegrees * Math.PI / 180);
  context.transform(
    transform.scale.x / 100,
    Math.tan(transform.skew.y * Math.PI / 180),
    Math.tan(transform.skew.x * Math.PI / 180),
    transform.scale.y / 100,
    0,
    0,
  );
  context.translate(-sourcePivot.x, -sourcePivot.y);

  const horizontal = isHorizontalDirection(direction);
  const axisLength = horizontal ? segment.width : segment.height;
  const hipPivot = lineMidpoint(getPivotLine(rig, 'hip', direction));
  const kneePivot = lineMidpoint(getPivotLine(rig, 'knee', direction));
  const anklePivot = lineMidpoint(getPivotLine(rig, 'ankle', direction));
  const hipPivotAxis = horizontal ? hipPivot.x : hipPivot.y;
  const kneePivotAxis = horizontal ? kneePivot.x : kneePivot.y;
  const anklePivotAxis = horizontal ? anklePivot.x : anklePivot.y;
  const hipAxis = Math.max(0, Math.min(axisLength - 1, hipPivotAxis + settings.hipSplitOffset));
  const kneeAxis = Math.max(hipAxis + 1, Math.min(axisLength, kneePivotAxis + settings.kneeSplitOffset));
  const bendStrength = Math.min(1, Math.abs(settings.bendX) / 32);
  const thighCompression = 1 - bendStrength * 0.82;
  const cut = getSegmentCut(settings, region, direction);

  for (let sourceAxis = 0; sourceAxis < axisLength; sourceAxis++) {
    let bendOffset = 0;
    let destinationAxis = sourceAxis;

    if (region === 1 && sourceAxis < hipAxis) {
      const distanceFromHip = (hipAxis - sourceAxis) / Math.max(1, hipAxis);
      bendOffset = settings.torsoLean * distanceFromHip;
      destinationAxis = sourceAxis;
    } else if (region === 2) {
      const progress = Math.max(0, Math.min(1, (sourceAxis - hipAxis) / Math.max(1, kneeAxis - hipAxis)));
      bendOffset = settings.bendX * progress;
      destinationAxis = hipAxis + (sourceAxis - hipAxis) * thighCompression;
    } else if (region === 3) {
      const shinEndAxis = Math.max(kneeAxis + 1, anklePivotAxis + settings.kneeSplitOffset);
      const progress = Math.max(0, Math.min(1, (sourceAxis - kneeAxis) / Math.max(1, shinEndAxis - kneeAxis)));
      bendOffset = settings.bendX + (settings.shinBend ?? 0) * progress;
      destinationAxis = sourceAxis + settings.kneeSplitOffset;
    }

    if (horizontal) {
      context.drawImage(
        segment,
        sourceAxis, 0, 1, segment.height,
        Math.round(destinationAxis + cut.x), Math.round(bendOffset + cut.y), 1, segment.height,
      );
    } else {
      context.drawImage(
        segment,
        0, sourceAxis, segment.width, 1,
        Math.round(bendOffset + cut.x), Math.round(destinationAxis + cut.y), segment.width, 1,
      );
    }
  }
  context.restore();
}

function renderRiggedOutfit(
  source: HTMLCanvasElement,
  rig: DirectionRig,
  settings: PoseSettings,
  direction: Direction,
): HTMLCanvasElement {
  const padding = 72;
  if (settings.anatomyEnabled) {
    return renderAnatomicalOutfit(source, rig, settings, padding);
  }
  const output = document.createElement('canvas');
  output.width = source.width + padding * 2;
  output.height = source.height + padding * 2;
  const context = output.getContext('2d')!;

  // Unassigned opaque pixels use the automatic anatomical region only in the
  // rendered preview. Manually painted mask pixels always take precedence.
  const previewMask = completeMaskForPreview(source, rig, direction);
  const torso = maskedSegment(source, previewMask, 1);
  const thigh = maskedSegment(source, previewMask, 2);
  const shin = maskedSegment(source, previewMask, 3);
  const locked = maskedSegment(source, previewMask, 4);

  const hipPivot = lineMidpoint(getPivotLine(rig, 'hip', direction));
  const kneePivot = lineMidpoint(getPivotLine(rig, 'knee', direction));
  const anklePivot = lineMidpoint(getPivotLine(rig, 'ankle', direction));
  const transformedKnee = transformSegmentPoint(
    kneePivot,
    hipPivot,
    hipPivot,
    settings.hipAngle,
    getSegmentTransform(settings, 'thigh'),
  );
  const transformedAnkle = transformSegmentPoint(
    anklePivot,
    kneePivot,
    transformedKnee,
    settings.hipAngle + settings.kneeAngle,
    getSegmentTransform(settings, 'shin'),
  );

  for (const segment of getSegmentOrder(settings)) {
    if (settings.segmentVisibility?.[segment] === false) continue;
    if (segment === 'torso') {
      drawRotatedSegment(
        context, torso, 1, rig, settings, hipPivot, hipPivot,
        settings.torsoAngle, padding, direction,
      );
    } else if (segment === 'thigh') {
      drawRotatedSegment(
        context, thigh, 2, rig, settings, hipPivot, hipPivot,
        settings.hipAngle, padding, direction,
      );
    } else {
      drawRotatedSegment(
        context,
        shin,
        3,
        rig,
        settings,
        kneePivot,
        transformedKnee,
        settings.hipAngle + settings.kneeAngle,
        padding,
        direction,
      );
    }
  }

  // Locked pixels (for example arms/hands) bypass every pose transform.
  context.drawImage(locked, padding, padding);

  // Tiny pivot pixels make it easier to spot disconnected segments without
  // introducing smoothing or changing the source art.
  context.fillStyle = 'rgba(255,255,255,0.16)';
  context.fillRect(Math.round(padding + transformedKnee.x), Math.round(padding + transformedKnee.y), 1, 1);
  context.fillRect(Math.round(padding + transformedAnkle.x), Math.round(padding + transformedAnkle.y), 1, 1);
  return output;
}

function renderMaskOverlay(rig: DirectionRig, mask = rig.mask): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = rig.width;
  canvas.height = rig.height;
  const context = canvas.getContext('2d')!;

  for (let y = 0; y < rig.height; y++) {
    for (let x = 0; x < rig.width; x++) {
      const region = mask[y * rig.width + x] as Region;
      if (region === 0) continue;
      context.fillStyle = REGION_COLORS[region as 1 | 2 | 3 | 4 | 5];
      context.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function renderAnatomyOverlay(rig: DirectionRig): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = rig.width;
  canvas.height = rig.height;
  const context = canvas.getContext('2d')!;
  for (let index = 0; index < rig.anatomyMask.length; index++) {
    const region = rig.anatomyMask[index];
    if (region === 0) continue;
    const part = BODY_PARTS[region - 1];
    if (!part) continue;
    context.fillStyle = `${part.color}94`;
    context.fillRect(index % rig.width, Math.floor(index / rig.width), 1, 1);
  }
  return canvas;
}

function drawAnatomyAnchors(
  context: CanvasRenderingContext2D,
  rig: DirectionRig,
  origin: Point,
  selectedPart: BodyPartId,
  matrices?: Map<BodyPartId, Matrix2D>,
): void {
  for (const part of BODY_PARTS) {
    const anchor = rig.anatomyAnchors[part.id];
    if (!anchor) continue;
    const displayedAnchor = matrices?.get(part.id)
      ? transformMatrixPoint(anchor, matrices.get(part.id)!)
      : anchor;
    const x = Math.round(origin.x + displayedAnchor.x);
    const y = Math.round(origin.y + displayedAnchor.y);
    context.save();
    context.beginPath();
    context.arc(x, y, 2.25, 0, Math.PI * 2);
    context.fillStyle = '#111827';
    context.fill();
    context.beginPath();
    context.arc(x, y, 1.5, 0, Math.PI * 2);
    context.fillStyle = part.color;
    context.fill();
    if (part.id === selectedPart) {
      context.beginPath();
      context.arc(x, y, 3, 0, Math.PI * 2);
      context.strokeStyle = '#ffffff';
      context.lineWidth = 0.75;
      context.stroke();
    }
    context.restore();
  }
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

function drawPivotLine(
  context: CanvasRenderingContext2D,
  line: PivotLine,
  origin: Point,
  color: string,
  label: string,
): void {
  const startX = Math.round(origin.x + line.start.x);
  const startY = Math.round(origin.y + line.start.y);
  const endX = Math.round(origin.x + line.end.x);
  const endY = Math.round(origin.y + line.end.y);
  const midpoint = lineMidpoint(line);
  const x = Math.round(origin.x + midpoint.x);
  const y = Math.round(origin.y + midpoint.y);
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(startX + 0.5, startY + 0.5);
  context.lineTo(endX + 0.5, endY + 0.5);
  context.stroke();
  context.fillStyle = '#11131b';
  context.fillRect(startX - 2, startY - 2, 5, 5);
  context.fillRect(endX - 2, endY - 2, 5, 5);
  context.fillStyle = color;
  context.fillRect(startX - 1, startY - 1, 3, 3);
  context.fillRect(endX - 1, endY - 1, 3, 3);
  context.fillRect(x - 1, y - 1, 3, 3);
  context.font = '8px monospace';
  context.fillText(label, x + 5, y + 3);
  context.restore();
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

function AnalogPositionControl({
  label,
  value,
  onChange,
  limit = 24,
  resetLabel = 'Center',
}: {
  label: string;
  value: Point;
  onChange: (value: Point) => void;
  limit?: number;
  resetLabel?: string;
}) {
  const draggingRef = useRef(false);
  const padRef = useRef<HTMLDivElement>(null);
  const clamp = (number: number) => Math.max(-limit, Math.min(limit, Math.round(number)));

  const updateFromCoordinates = (clientX: number, clientY: number) => {
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = Math.max(1, rect.width / 2 - 6);
    let normalizedX = (clientX - (rect.left + rect.width / 2)) / radius;
    let normalizedY = (clientY - (rect.top + rect.height / 2)) / radius;
    const length = Math.hypot(normalizedX, normalizedY);
    if (length > 1) {
      normalizedX /= length;
      normalizedY /= length;
    }
    onChange({
      x: clamp(normalizedX * limit),
      y: clamp(normalizedY * limit),
    });
  };

  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <span className="text-[9px] font-medium text-emperia-text">{label}</span>
      <div
        ref={padRef}
        role="slider"
        aria-label={`${label} X ${value.x}, Y ${value.y}`}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          draggingRef.current = true;
          updateFromCoordinates(event.clientX, event.clientY);
          const move = (moveEvent: PointerEvent) => {
            if (draggingRef.current) updateFromCoordinates(moveEvent.clientX, moveEvent.clientY);
          };
          const stop = () => {
            draggingRef.current = false;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
            window.removeEventListener('pointercancel', stop);
            window.removeEventListener('blur', stop);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', stop);
          window.addEventListener('pointercancel', stop);
          window.addEventListener('blur', stop);
        }}
        onDoubleClick={() => onChange({ x: 0, y: 0 })}
        className="relative h-12 w-12 touch-none select-none rounded-full border border-emperia-border bg-emperia-bg shadow-inner"
      >
        <span className="absolute left-1/2 top-1 h-[calc(100%-0.5rem)] w-px -translate-x-1/2 bg-emperia-border/70" />
        <span className="absolute left-1 top-1/2 h-px w-[calc(100%-0.5rem)] -translate-y-1/2 bg-emperia-border/70" />
        <span
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-emperia-accent bg-emperia-accent/35 shadow"
          style={{
            left: `${50 + (value.x / limit) * 37.5}%`,
            top: `${50 + (value.y / limit) * 37.5}%`,
          }}
        />
      </div>
      <div className="grid w-full grid-cols-2 gap-1">
        <label className="flex items-center gap-0.5 text-[8px] text-emperia-muted">
          X
          <input
            type="number"
            min={-limit}
            max={limit}
            value={value.x}
            onChange={(event) => onChange({ ...value, x: clamp(Number(event.target.value)) })}
            className="min-w-0 flex-1 rounded border border-emperia-border bg-emperia-bg px-1 py-0.5 text-center font-mono text-[8px] text-emperia-text"
          />
        </label>
        <label className="flex items-center gap-0.5 text-[8px] text-emperia-muted">
          Y
          <input
            type="number"
            min={-limit}
            max={limit}
            value={value.y}
            onChange={(event) => onChange({ ...value, y: clamp(Number(event.target.value)) })}
            className="min-w-0 flex-1 rounded border border-emperia-border bg-emperia-bg px-1 py-0.5 text-center font-mono text-[8px] text-emperia-text"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={() => onChange({ x: 0, y: 0 })}
        className="rounded px-1 text-[8px] text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text"
      >
        {resetLabel}
      </button>
    </div>
  );
}

export function PoseLab() {
  const objectData = useOBStore((state) => state.objectData);
  const spriteData = useOBStore((state) => state.spriteData);
  const spriteOverrides = useOBStore((state) => state.spriteOverrides);
  const editVersion = useOBStore((state) => state.editVersion);
  const selectedThingId = useOBStore((state) => state.selectedThingId);
  const appearanceToItemIds = useOBStore((state) => state.appearanceToItemIds);
  const updateSeatPoseProfile = useOBStore((state) => state.updateSeatPoseProfile);
  const updateItemSeatDefinition = useOBStore((state) => state.updateItemSeatDefinition);
  const createPoseSet = useOBStore((state) => state.createPoseSet);
  const renamePoseSet = useOBStore((state) => state.renamePoseSet);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ghostCanvasRef = useRef<HTMLCanvasElement>(null);
  const rigControlCanvasRef = useRef<HTMLCanvasElement>(null);
  const anatomicalRigImportRef = useRef<HTMLInputElement>(null);
  const paintingRef = useRef(false);
  const anatomyTransformDragRef = useRef<
    | {
        mode: 'rotate';
        pointerId: number;
        partId: BodyPartId;
        center: Point;
        startPointerAngle: number;
        startRotation: number;
      }
    | {
        mode: 'move';
        pointerId: number;
        partId: BodyPartId;
        startPointer: Point;
        startOffset: Point;
        inverseParent: Matrix2D;
      }
    | null
  >(null);
  const [outfitId, setOutfitId] = useState(134);
  const [poseAction, setPoseAction] = useState<PoseAction>('sit');
  const [poseSetId, setPoseSetId] = useState(1);
  const [poseSetName, setPoseSetName] = useState('');
  const [benchItemIds, setBenchItemIds] = useState<number[] | number>(
    () => [1662, 1665, 1662, 1662],
  );
  const [bindingItemId, setBindingItemId] = useState(1662);
  const [direction, setDirection] = useState<Direction>(2);
  const [zoom, setZoom] = useState(3);
  const [ghostZoom, setGhostZoom] = useState(4);
  const [brushSize, setBrushSize] = useState(3);
  const [editTool, setEditTool] = useState<EditTool>('thigh');
  const [selectedBodyPart, setSelectedBodyPart] = useState<BodyPartId>('torso');
  const [anatomyEditMode, setAnatomyEditMode] = useState<'paint' | 'anchor' | 'erase'>('paint');
  const [transformSegment, setTransformSegment] = useState<PoseSegment>('torso');
  const [labMode, setLabMode] = useState<'pose' | 'bind'>('pose');
  const [settingsByDirection, setSettingsByDirection] = useState<PoseSettings[] | PoseSettings>(
    () => Array.from({ length: 4 }, () => ({ ...DEFAULT_SETTINGS })),
  );
  const [rigs, setRigs] = useState<Array<DirectionRig | null>>([null, null, null, null]);
  const [copyStatus, setCopyStatus] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [referenceStatus, setReferenceStatus] = useState('');
  const [itemOffsetDrafts, setItemOffsetDrafts] = useState<Record<string, Point>>({});
  useEffect(() => {
    const mainCanvas = canvasRef.current;
    const sourceCanvas = ghostCanvasRef.current;
    const mainWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setZoom((current) => Math.max(1, Math.min(12, current + (event.deltaY < 0 ? 1 : -1))));
    };
    const sourceWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setGhostZoom((current) => Math.max(1, Math.min(12, current + (event.deltaY < 0 ? 1 : -1))));
    };
    mainCanvas?.addEventListener('wheel', mainWheel, { passive: false });
    sourceCanvas?.addEventListener('wheel', sourceWheel, { passive: false });
    return () => {
      mainCanvas?.removeEventListener('wheel', mainWheel);
      sourceCanvas?.removeEventListener('wheel', sourceWheel);
    };
  }, []);
  const directionName = DIRECTION_LABELS[direction].toLowerCase() as SeatDirection;
  const matchingPoseSets = useMemo(
    () => Array.from(objectData?.poseSets.values() ?? [])
      .filter((poseSet) => poseSet.action === poseAction)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [objectData, poseAction],
  );
  const activePoseSet = objectData?.poseSets.get(poseSetId) ?? null;
  const storedProfile = objectData?.seatPoseProfiles.get(
    poseSetProfileKey(poseSetId, directionName),
  );
  useEffect(() => {
    const selected = matchingPoseSets.find((poseSet) => poseSet.id === poseSetId);
    if (selected) {
      setPoseSetName(selected.name);
      return;
    }
    if (labMode === 'bind' && poseSetId === 0) {
      setPoseSetName('');
      return;
    }
    const fallback = matchingPoseSets[0];
    setPoseSetId(fallback?.id ?? 0);
    setPoseSetName(fallback?.name ?? '');
  }, [labMode, matchingPoseSets, poseSetId]);
  const selectedReferenceItemId = useMemo(() => {
    if (selectedThingId == null || !objectData) return null;
    const selectedThing = objectData.things.get(selectedThingId);
    if (!selectedThing || selectedThing.category !== 'item') return null;
    return appearanceToItemIds.get(selectedThingId)
      ?? Array.from(objectData.itemAppearances.entries())
        .find(([, appearanceId]) => appearanceId === selectedThingId)?.[0]
      ?? null;
  }, [appearanceToItemIds, objectData, selectedThingId]);
  const previewItemId = Array.isArray(benchItemIds)
    ? benchItemIds[direction] ?? (direction === 1 ? 1665 : 1662)
    : benchItemIds;
  const benchItemId = labMode === 'bind' ? bindingItemId : previewItemId;
  const referenceAppearanceId = objectData?.itemAppearances.get(benchItemId) ?? null;
  const referenceSeatDefinition = objectData?.itemSeatDefinitions.get(benchItemId) ?? null;
  const referenceOffsetKey = `${benchItemId}:${directionName}`;
  const referenceItemOffset = referenceSeatDefinition?.offsets[directionName]
    ?? itemOffsetDrafts[referenceOffsetKey]
    ?? { x: 0, y: 0 };
  const updateReferenceItemOffset = useCallback((axis: 'x' | 'y', value: number) => {
    if (referenceAppearanceId == null) return;
    if (referenceSeatDefinition) {
      updateItemSeatDefinition(referenceAppearanceId, {
        ...referenceSeatDefinition,
        offsets: {
          ...referenceSeatDefinition.offsets,
          [directionName]: {
            ...referenceSeatDefinition.offsets[directionName],
            [axis]: value,
          },
        },
      });
      return;
    }
    setItemOffsetDrafts((current) => ({
      ...current,
      [referenceOffsetKey]: {
        ...(current[referenceOffsetKey] ?? { x: 0, y: 0 }),
        [axis]: value,
      },
    }));
  }, [
    directionName,
    referenceAppearanceId,
    referenceOffsetKey,
    referenceSeatDefinition,
    updateItemSeatDefinition,
  ]);
  const setBenchItemId = useCallback((value: number) => {
    if (labMode === 'bind') {
      setBindingItemId(value);
      return;
    }
    setBenchItemIds((current) => {
      const next = Array.isArray(current)
        ? [...current]
        : [1662, 1665, 1662, 1662];
      next[direction] = value;
      return next;
    });
  }, [direction, labMode]);

  const useSelectedItemAsReference = useCallback(() => {
    if (selectedReferenceItemId == null || !objectData) {
      setReferenceStatus('Select an item first');
      return;
    }

    const seat = objectData.itemSeatDefinitions.get(selectedReferenceItemId);
    const availableDirections = ([0, 1, 2, 3] as Direction[]).filter(
      (candidate) => seat && (seat.directionMask & (1 << candidate)) !== 0,
    );
    const targetDirection = availableDirections.includes(direction)
      ? direction
      : availableDirections[0] ?? direction;

    if (labMode === 'bind') {
      setBindingItemId(selectedReferenceItemId);
    } else {
      setBenchItemIds((current) => {
        const next = Array.isArray(current)
          ? [...current]
          : [1662, 1665, 1662, 1662];
        next[targetDirection] = selectedReferenceItemId;
        return next;
      });
    }
    setDirection(targetDirection);

    if (seat && labMode === 'bind') {
      setPoseSetId(seat.poseSetId);
      const referencedPoseSet = objectData.poseSets.get(seat.poseSetId);
      if (referencedPoseSet) setPoseAction(referencedPoseSet.action);
      setReferenceStatus(`Item ${selectedReferenceItemId} · ${DIRECTION_LABELS[targetDirection]}`);
    } else if (seat) {
      setReferenceStatus(`Preview item ${selectedReferenceItemId} · ${DIRECTION_LABELS[targetDirection]}`);
    } else {
      setReferenceStatus(`Item ${selectedReferenceItemId} · no seating metadata`);
    }
  }, [direction, labMode, objectData, selectedReferenceItemId]);
  const settings = Array.isArray(settingsByDirection)
    ? settingsByDirection[direction] ?? DEFAULT_SETTINGS
    : settingsByDirection;
  const setSettings = useCallback((
    update: PoseSettings | ((current: PoseSettings) => PoseSettings),
  ) => {
    setSettingsByDirection((current) => {
      const next = Array.isArray(current)
        ? [...current]
        : Array.from({ length: 4 }, () => ({ ...DEFAULT_SETTINGS }));
      const currentSettings = Array.isArray(current)
        ? current[direction] ?? { ...DEFAULT_SETTINGS }
        : current;
      next[direction] = typeof update === 'function'
        ? update(currentSettings)
        : { ...update };
      return next;
    });
  }, [direction]);

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
    ? `${outfitId}:${direction}:${resolved.outfit.width}x${resolved.outfit.height}${isHorizontalDirection(direction) ? ':horizontal-v2' : ''}`
    : '';
  const activeRig = rigs[direction];

  useEffect(() => {
    if (!resolved.outfit || !sourceKey) return;
    setRigs((current) => {
      if (current[direction]?.sourceKey === sourceKey) return current;
      const next = [...current];
      next[direction] = createAutomaticRig(resolved.outfit!, sourceKey, direction);
      return next;
    });
  }, [resolved.outfit, sourceKey, direction]);

  useEffect(() => {
    if (!resolved.outfit) return;
    if (!storedProfile) {
      setSettings(DEFAULT_SETTINGS);
      setRigs((current) => {
        const next = [...current];
        next[direction] = createAutomaticRig(resolved.outfit!, sourceKey, direction);
        return next;
      });
      return;
    }
    const mask = new Uint8Array(storedProfile.width * storedProfile.height);
    for (const region of [1, 2, 3, 4, 5] as const) {
      const ranges = storedProfile.maskRanges[region];
      if (!ranges) continue;
      for (const token of ranges.split(',')) {
        const [startText, endText] = token.split('-');
        const start = Number(startText);
        const end = endText == null ? start : Number(endText);
        for (let index = start; index <= end && index < mask.length; index++) mask[index] = region;
      }
    }
    const anatomyMask = new Uint8Array(storedProfile.width * storedProfile.height);
    const anatomyAnchors: Partial<Record<BodyPartId, Point>> = {};
    for (const part of storedProfile.anatomicalRig?.parts ?? []) {
      anatomyAnchors[part.id] = { ...part.anchor };
      const anatomyRegion = BODY_PART_INDEX.get(part.id);
      const ranges = storedProfile.anatomicalRig?.maskRanges[part.id];
      if (!anatomyRegion || !ranges) continue;
      for (const token of ranges.split(',')) {
        const [startText, endText] = token.split('-');
        const start = Number(startText);
        const end = endText == null ? start : Number(endText);
        for (let index = start; index <= end && index < anatomyMask.length; index++) {
          anatomyMask[index] = anatomyRegion;
        }
      }
    }
    setRigs((current) => {
      const next = [...current];
      next[direction] = {
        sourceKey,
        width: storedProfile.width,
        height: storedProfile.height,
        hip: lineMidpoint(storedProfile.hip),
        knee: lineMidpoint(storedProfile.knee),
        ankle: lineMidpoint(storedProfile.ankle),
        hipLine: structuredClone(storedProfile.hip),
        kneeLine: structuredClone(storedProfile.knee),
        ankleLine: structuredClone(storedProfile.ankle),
        mask,
        anatomyMask,
        anatomyAnchors,
      };
      return next;
    });
    const order = storedProfile.drawLayers.map(({ region }) =>
      region === 1 ? 'torso' : region === 2 ? 'thigh' : 'shin'
    ) as PoseSegment[];
    const visibility: Partial<Record<PoseSegment, boolean>> = {};
    for (const layer of storedProfile.drawLayers) {
      visibility[layer.region === 1 ? 'torso' : layer.region === 2 ? 'thigh' : 'shin'] = layer.visible;
    }
    const anatomyTransforms = createDefaultAnatomyTransforms();
    const anatomyParents = createDefaultAnatomyParents();
    for (const part of storedProfile.anatomicalRig?.parts ?? []) {
      anatomyTransforms[part.id] = {
        rotation: part.rotation,
        offset: { ...part.offset },
        visible: part.visible,
      };
      anatomyParents[part.id] = part.parentId;
    }
    setSettings({
      ...DEFAULT_SETTINGS,
      torsoAngle: storedProfile.torsoAngle,
      hipAngle: storedProfile.hipAngle,
      kneeAngle: storedProfile.kneeAngle,
      bendX: storedProfile.bend,
      shinBend: storedProfile.shinBend,
      hipSplitOffset: storedProfile.hipSplitOffset,
      kneeSplitOffset: storedProfile.kneeSplitOffset,
      torsoCut: { ...storedProfile.torsoCut },
      thighCut: { ...storedProfile.thighCut },
      shinCut: { ...storedProfile.shinCut },
      segmentOrder: order,
      segmentVisibility: visibility,
      segmentTransforms: {
        torso: structuredClone(
          storedProfile.segmentTransforms?.torso ?? DEFAULT_SETTINGS.segmentTransforms.torso,
        ),
        thigh: structuredClone(
          storedProfile.segmentTransforms?.thigh ?? DEFAULT_SETTINGS.segmentTransforms.thigh,
        ),
        shin: structuredClone(
          storedProfile.segmentTransforms?.shin ?? DEFAULT_SETTINGS.segmentTransforms.shin,
        ),
      },
      torsoLean: storedProfile.torsoLean,
      playerX: storedProfile.playerOffset.x,
      playerY: storedProfile.playerOffset.y,
      benchX: storedProfile.benchOffset.x,
      benchY: storedProfile.benchOffset.y,
      anatomyEnabled: storedProfile.anatomicalRig != null,
      anatomyTransforms,
      anatomyParents,
      anatomyOrder: storedProfile.anatomicalRig?.drawOrder?.length
        ? [...storedProfile.anatomicalRig.drawOrder]
        : BODY_PARTS.map((part) => part.id),
    });
  }, [poseSetId, direction, storedProfile, resolved.outfit, sourceKey]);

  const sceneGeometry = useMemo(() => {
    const anchorX = 160;
    const anchorY = Math.round(240 * 0.72);
    const originalX = resolved.outfit
      ? Math.round(anchorX - resolved.outfit.width + settings.playerX + referenceItemOffset.x)
      : anchorX;
    const originalY = resolved.outfit
      ? Math.round(anchorY - resolved.outfit.height + settings.playerY + referenceItemOffset.y)
      : anchorY;
    return { anchorX, anchorY, originalX, originalY };
  }, [
    referenceItemOffset.x,
    referenceItemOffset.y,
    resolved.outfit,
    settings.playerX,
    settings.playerY,
  ]);

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
        Math.round(sceneGeometry.anchorX - resolved.bench.width + settings.benchX),
        Math.round(sceneGeometry.anchorY - resolved.bench.height + settings.benchY),
      );
    }

    if (!resolved.outfit || !activeRig || activeRig.sourceKey !== sourceKey) return;

    const deformed = renderRiggedOutfit(resolved.outfit, activeRig, settings, direction);
    context.drawImage(deformed, sceneGeometry.originalX - 72, sceneGeometry.originalY - 72);
  }, [resolved, activeRig, sourceKey, settings, sceneGeometry]);

  const rigControlGeometry = useMemo(() => ({
    x: resolved.outfit
      ? Math.round((RIG_CONTROL_CANVAS_SIZE - resolved.outfit.width) / 2)
      : RIG_CONTROL_CANVAS_SIZE / 2,
    y: resolved.outfit
      ? Math.round((RIG_CONTROL_CANVAS_SIZE - resolved.outfit.height) / 2)
      : RIG_CONTROL_CANVAS_SIZE / 2,
  }), [resolved.outfit]);

  const rigControlNodes = useMemo(() => {
    if (!settings.anatomyEnabled || !activeRig) return [];
    const matrices = getBodyPartMatrices(activeRig, settings);
    return BODY_PARTS.flatMap((part) => {
      const anchor = activeRig.anatomyAnchors[part.id];
      const matrix = matrices.get(part.id);
      if (!anchor || !matrix) return [];
      const transformedAnchor = transformMatrixPoint(anchor, matrix);
      return [{
        ...part,
        x: rigControlGeometry.x + transformedAnchor.x,
        y: rigControlGeometry.y + transformedAnchor.y,
        worldRotation: Math.atan2(matrix.b, matrix.a),
        rotation: settings.anatomyTransforms?.[part.id]?.rotation ?? 0,
      }];
    });
  }, [settings, activeRig, rigControlGeometry]);

  useEffect(() => {
    const canvas = rigControlCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    drawCheckerboard(context, canvas.width, canvas.height);
    if (!resolved.outfit || !activeRig || activeRig.sourceKey !== sourceKey) return;
    const deformed = renderRiggedOutfit(resolved.outfit, activeRig, settings, direction);
    context.drawImage(deformed, rigControlGeometry.x - 72, rigControlGeometry.y - 72);
  }, [resolved.outfit, activeRig, sourceKey, settings, direction, rigControlGeometry]);

  const ghostGeometry = useMemo(() => ({ x: 0, y: 0 }), []);

  useEffect(() => {
    const canvas = ghostCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.imageSmoothingEnabled = false;
    drawCheckerboard(context, canvas.width, canvas.height);
    if (!resolved.outfit || !activeRig || activeRig.sourceKey !== sourceKey) return;

    context.save();
    context.globalAlpha = 1;
    context.drawImage(resolved.outfit, ghostGeometry.x, ghostGeometry.y);
    context.restore();

    if (settings.showMasks) {
      const overlay = settings.anatomyEnabled
        ? renderAnatomyOverlay(activeRig)
        : renderMaskOverlay(
            activeRig,
            completeMaskForPreview(resolved.outfit, activeRig, direction),
          );
      context.drawImage(overlay, ghostGeometry.x, ghostGeometry.y);
    }
    if (settings.showPivots) {
      if (settings.anatomyEnabled) {
        drawAnatomyAnchors(context, activeRig, ghostGeometry, selectedBodyPart);
      } else {
        drawPivotLine(context, getPivotLine(activeRig, 'hip', direction), ghostGeometry, '#fbbf24', 'H');
        drawPivotLine(context, getPivotLine(activeRig, 'knee', direction), ghostGeometry, '#a78bfa', 'K');
        drawPivotLine(context, getPivotLine(activeRig, 'ankle', direction), ghostGeometry, '#22d3ee', 'A');
      }
    }
  }, [resolved.outfit, activeRig, sourceKey, settings, ghostGeometry, direction, selectedBodyPart]);

  const updateSetting = <K extends keyof PoseSettings>(key: K, value: PoseSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const updateSegmentTransform = (
    property: keyof PoseSegmentTransform,
    axis: 'x' | 'y',
    value: number,
  ) => {
    setSettings((current) => {
      const transform = getSegmentTransform(current, transformSegment);
      return {
        ...current,
        segmentTransforms: {
          ...current.segmentTransforms,
          [transformSegment]: {
            ...transform,
            [property]: {
              ...transform[property],
              [axis]: value,
            },
          },
        },
      };
    });
  };

  const resetSegmentTransform = () => {
    setSettings((current) => ({
      ...current,
      segmentTransforms: {
        ...current.segmentTransforms,
        [transformSegment]: structuredClone(DEFAULT_SETTINGS.segmentTransforms[transformSegment]),
      },
    }));
  };

  const moveSegmentLayer = (segment: PoseSegment, delta: -1 | 1) => {
    setSettings((current) => {
      const order = getSegmentOrder(current);
      const index = order.indexOf(segment);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= order.length) return current;
      const nextOrder = [...order];
      [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
      return { ...current, segmentOrder: nextOrder };
    });
  };

  const setSegmentVisible = (segment: PoseSegment, visible: boolean) => {
    setSettings((current) => ({
      ...current,
      segmentVisibility: {
        torso: current.segmentVisibility?.torso ?? true,
        thigh: current.segmentVisibility?.thigh ?? true,
        shin: current.segmentVisibility?.shin ?? true,
        [segment]: visible,
      },
    }));
  };

  const updateBodyPartTransform = (
    update: Partial<Omit<BodyPartTransform, 'offset'>> & { offset?: Partial<Point> },
  ) => {
    setSettings((current) => {
      const existing = current.anatomyTransforms?.[selectedBodyPart]
        ?? { rotation: 0, offset: { x: 0, y: 0 }, visible: true };
      return {
        ...current,
        anatomyTransforms: {
          ...current.anatomyTransforms,
          [selectedBodyPart]: {
            ...existing,
            ...update,
            offset: { ...existing.offset, ...update.offset },
          },
        },
      };
    });
  };

  const resetAllBodyPartTransforms = () => {
    setSettings((current) => ({
      ...current,
      anatomyTransforms: createDefaultAnatomyTransforms(),
    }));
  };

  const moveBodyPartLayer = (delta: -1 | 1) => {
    setSettings((current) => {
      const order = [...(current.anatomyOrder ?? BODY_PARTS.map((part) => part.id))];
      const index = order.indexOf(selectedBodyPart);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= order.length) return current;
      [order[index], order[target]] = [order[target], order[index]];
      return { ...current, anatomyOrder: order };
    });
  };

  const setBodyPartAttached = (attached: boolean) => {
    setSettings((current) => ({
      ...current,
      anatomyParents: {
        ...(current.anatomyParents ?? createDefaultAnatomyParents()),
        [selectedBodyPart]: attached
          ? BODY_PART_BY_ID.get(selectedBodyPart)?.parentId ?? null
          : null,
      },
    }));
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
    const canvas = ghostCanvasRef.current;
    if (!canvas || !resolved.outfit || !activeRig) return null;
    const rect = canvas.getBoundingClientRect();
    const sceneX = (event.clientX - rect.left) * canvas.width / rect.width;
    const sceneY = (event.clientY - rect.top) * canvas.height / rect.height;
    const x = Math.floor(sceneX - ghostGeometry.x);
    const y = Math.floor(sceneY - ghostGeometry.y);
    if (x < 0 || y < 0 || x >= activeRig.width || y >= activeRig.height) return null;
    return { x, y };
  };

  const findAnatomyAnchorAt = (
    point: Point,
    origin: Point,
    transformed: boolean,
  ): BodyPartId | null => {
    if (!activeRig) return null;
    const matrices = transformed ? getBodyPartMatrices(activeRig, settings) : null;
    const order = settings.anatomyOrder?.length > 0
      ? settings.anatomyOrder
      : BODY_PARTS.map((part) => part.id);
    let closest: { id: BodyPartId; distance: number } | null = null;

    for (const id of order) {
      const anchor = activeRig.anatomyAnchors[id];
      if (!anchor) continue;
      const displayedAnchor = matrices?.get(id)
        ? transformMatrixPoint(anchor, matrices.get(id)!)
        : anchor;
      const distance = Math.hypot(
        point.x - origin.x - displayedAnchor.x,
        point.y - origin.y - displayedAnchor.y,
      );
      if (distance <= 4 && (!closest || distance <= closest.distance)) {
        closest = { id, distance };
      }
    }
    return closest?.id ?? null;
  };

  const applyTool = (point: Point) => {
    if (!resolved.outfit || !activeRig) return;

    const sourcePixels = resolved.outfit.getContext('2d')!
      .getImageData(0, 0, resolved.outfit.width, resolved.outfit.height).data;
    const region: Region = editTool === 'torso'
      ? 1
      : editTool === 'thigh'
        ? 2
        : editTool === 'shin'
          ? 3
          : editTool === 'locked'
            ? 4
            : editTool === 'hidden'
              ? 5
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

  const applyAnatomyTool = (point: Point) => {
    if (!resolved.outfit || !activeRig) return;
    const sourcePixels = resolved.outfit.getContext('2d')!
      .getImageData(0, 0, resolved.outfit.width, resolved.outfit.height).data;
    const region = anatomyEditMode === 'erase'
      ? 0
      : BODY_PART_INDEX.get(selectedBodyPart) ?? 0;
    const radius = Math.floor(brushSize / 2);
    updateActiveRig((rig) => {
      for (let y = point.y - radius; y <= point.y + radius; y++) {
        for (let x = point.x - radius; x <= point.x + radius; x++) {
          if (x < 0 || y < 0 || x >= rig.width || y >= rig.height) continue;
          if ((x - point.x) ** 2 + (y - point.y) ** 2 > radius ** 2 + 0.5) continue;
          const index = y * rig.width + x;
          if (region !== 0 && sourcePixels[index * 4 + 3] === 0) continue;
          rig.anatomyMask[index] = region;
        }
      }
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (settings.anatomyEnabled) {
      if (anatomyEditMode === 'anchor' ? !settings.showPivots : !settings.showMasks) return;
      const point = canvasPoint(event);
      if (!point) return;
      if (settings.showPivots) {
        const anchorPart = findAnatomyAnchorAt(point, ghostGeometry, false);
        if (anchorPart) {
          setSelectedBodyPart(anchorPart);
          paintingRef.current = false;
          return;
        }
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      paintingRef.current = anatomyEditMode !== 'anchor';
      if (anatomyEditMode === 'anchor') {
        updateActiveRig((rig) => {
          rig.anatomyAnchors[selectedBodyPart] = { ...point };
        });
      } else {
        applyAnatomyTool(point);
      }
      return;
    }
    const isPivotTool = editTool === 'hip' || editTool === 'knee' || editTool === 'ankle';
    if (isPivotTool ? !settings.showPivots : !settings.showMasks) return;
    const point = canvasPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    paintingRef.current = true;
    if (isPivotTool) {
      updateActiveRig((rig) => {
        // Profiles created before automatic masks stayed live stored their
        // generated anatomy as painted regions. Redrawing a pivot migrates
        // those pixels back to automatic while preserving Locked/Hidden.
        for (let index = 0; index < rig.mask.length; index++) {
          if (rig.mask[index] >= 1 && rig.mask[index] <= 3) rig.mask[index] = 0;
        }
        setRigPivotLine(rig, editTool, {
          start: { ...point },
          end: { ...point },
        });
      });
    } else {
      applyTool(point);
    }
  };

  const rigControlPoint = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = rigControlCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * canvas.width / rect.width,
      y: (event.clientY - rect.top) * canvas.height / rect.height,
    };
  };

  const handleRigControlPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!settings.anatomyEnabled || !activeRig) return;
    const point = rigControlPoint(event);
    if (!point) return;
    const selectedNode = rigControlNodes.find((node) => node.id === selectedBodyPart);
    if (selectedNode) {
      const distance = Math.hypot(point.x - selectedNode.x, point.y - selectedNode.y);
      if (distance >= 5.5 && distance <= 13.5) {
        anatomyTransformDragRef.current = {
          mode: 'rotate',
          pointerId: event.pointerId,
          partId: selectedBodyPart,
          center: { x: selectedNode.x, y: selectedNode.y },
          startPointerAngle: Math.atan2(point.y - selectedNode.y, point.x - selectedNode.x),
          startRotation: settings.anatomyTransforms?.[selectedBodyPart]?.rotation ?? 0,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    const targetNode = rigControlNodes.reduce<(typeof rigControlNodes)[number] | null>(
      (closest, node) => {
        const distance = Math.hypot(point.x - node.x, point.y - node.y);
        if (distance > 4) return closest;
        if (!closest) return node;
        const closestDistance = Math.hypot(point.x - closest.x, point.y - closest.y);
        return distance <= closestDistance ? node : closest;
      },
      null,
    );
    if (!targetNode) return;

    setSelectedBodyPart(targetNode.id);
    const matrices = getBodyPartMatrices(activeRig, settings);
    const parentId = settings.anatomyParents?.[targetNode.id]
      ?? BODY_PART_BY_ID.get(targetNode.id)?.parentId
      ?? null;
    const inverseParent = invertMatrix(parentId
      ? matrices.get(parentId) ?? IDENTITY_MATRIX
      : IDENTITY_MATRIX) ?? IDENTITY_MATRIX;
    const transform = settings.anatomyTransforms?.[targetNode.id]
      ?? { rotation: 0, offset: { x: 0, y: 0 }, visible: true };
    anatomyTransformDragRef.current = {
      mode: 'move',
      pointerId: event.pointerId,
      partId: targetNode.id,
      startPointer: point,
      startOffset: { ...transform.offset },
      inverseParent,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handleRigControlPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = anatomyTransformDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = rigControlPoint(event);
    if (!point) return;

    setSettings((current) => {
      const existing = current.anatomyTransforms?.[drag.partId]
        ?? { rotation: 0, offset: { x: 0, y: 0 }, visible: true };
      if (drag.mode === 'move') {
        const worldDelta = {
          x: point.x - drag.startPointer.x,
          y: point.y - drag.startPointer.y,
        };
        const localDelta = {
          x: drag.inverseParent.a * worldDelta.x + drag.inverseParent.c * worldDelta.y,
          y: drag.inverseParent.b * worldDelta.x + drag.inverseParent.d * worldDelta.y,
        };
        return {
          ...current,
          anatomyTransforms: {
            ...current.anatomyTransforms,
            [drag.partId]: {
              ...existing,
              offset: {
                x: Math.round(drag.startOffset.x + localDelta.x),
                y: Math.round(drag.startOffset.y + localDelta.y),
              },
            },
          },
        };
      }

      const pointerAngle = Math.atan2(point.y - drag.center.y, point.x - drag.center.x);
      let delta = (pointerAngle - drag.startPointerAngle) * 180 / Math.PI;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      let rotation = drag.startRotation + delta;
      while (rotation > 180) rotation -= 360;
      while (rotation < -180) rotation += 360;
      rotation = Math.round(rotation);
      return {
        ...current,
        anatomyTransforms: {
          ...current.anatomyTransforms,
          [drag.partId]: { ...existing, rotation },
        },
      };
    });
  };

  const stopRigControlTransform = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (anatomyTransformDragRef.current?.pointerId !== event.pointerId) return;
    anatomyTransformDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    const point = canvasPoint(event);
    if (!point) return;
    if (settings.anatomyEnabled) {
      if (settings.showMasks) applyAnatomyTool(point);
      return;
    }
    if (editTool === 'hip' || editTool === 'knee' || editTool === 'ankle') {
      if (!settings.showPivots) return;
      updateActiveRig((rig) => {
        const currentLine = getPivotLine(rig, editTool, direction);
        setRigPivotLine(rig, editTool, {
          start: { ...currentLine.start },
          end: { ...point },
        });
      });
      return;
    }
    if (settings.showMasks) applyTool(point);
  };

  const stopPainting = () => {
    paintingRef.current = false;
  };

  const resetCurrentRig = () => {
    if (!resolved.outfit) return;
    setRigs((current) => {
      const next = [...current];
      next[direction] = createAutomaticRig(resolved.outfit!, sourceKey, direction);
      return next;
    });
  };

  const copyRigJson = async () => {
    if (!activeRig) return;
    const compactMask: Record<string, number[]> = {
      torso: [],
      thigh: [],
      shin: [],
      locked: [],
      hidden: [],
    };
    activeRig.mask.forEach((region, index) => {
      if (region === 1) compactMask.torso.push(index);
      else if (region === 2) compactMask.thigh.push(index);
      else if (region === 3) compactMask.shin.push(index);
      else if (region === 4) compactMask.locked.push(index);
      else if (region === 5) compactMask.hidden.push(index);
    });
    const payload = {
      outfitId,
      benchItemId,
      direction: DIRECTION_LABELS[direction].toLowerCase(),
      size: { width: activeRig.width, height: activeRig.height },
      pivots: {
        hip: getPivotLine(activeRig, 'hip', direction),
        knee: getPivotLine(activeRig, 'knee', direction),
        ankle: getPivotLine(activeRig, 'ankle', direction),
      },
      pose: {
        torsoAngle: settings.torsoAngle,
        hipAngle: settings.hipAngle,
        kneeAngle: settings.kneeAngle,
        bendX: settings.bendX,
        hipSplitOffset: settings.hipSplitOffset,
        kneeSplitOffset: settings.kneeSplitOffset,
        torsoCut: getSegmentCut(settings, 1, direction),
        thighCut: getSegmentCut(settings, 2, direction),
        shinCut: getSegmentCut(settings, 3, direction),
        torsoLean: settings.torsoLean,
        shinBend: settings.shinBend ?? 0,
        segmentTransforms: structuredClone(settings.segmentTransforms),
      },
      drawLayers: getSegmentOrder(settings).map((segment) => ({
        segment,
        visible: settings.segmentVisibility?.[segment] !== false,
      })),
      placement: {
        playerX: settings.playerX,
        playerY: settings.playerY,
        benchX: settings.benchX,
        benchY: settings.benchY,
      },
      mask: compactMask,
      anatomicalRig: settings.anatomyEnabled
        ? {
            selectedPart: selectedBodyPart,
            parts: BODY_PARTS.map((part) => ({
              id: part.id,
              parentId: settings.anatomyParents?.[part.id] ?? part.parentId,
              anchor: activeRig.anatomyAnchors[part.id] ?? null,
              ...settings.anatomyTransforms?.[part.id],
            })),
            drawOrder: settings.anatomyOrder ?? BODY_PARTS.map((part) => part.id),
          }
        : undefined,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Copy failed');
    }
    window.setTimeout(() => setCopyStatus(''), 1200);
  };

  const encodeMaskRanges = (mask: Uint8Array, region: number): string => {
    const ranges: string[] = [];
    let start = -1;
    let previous = -1;
    mask.forEach((value, index) => {
      if (value !== region) return;
      if (start < 0) {
        start = previous = index;
      } else if (index === previous + 1) {
        previous = index;
      } else {
        ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
        start = previous = index;
      }
    });
    if (start >= 0) ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    return ranges.join(',');
  };

  const createAnatomicalRigPayload = (): AnatomicalRig | null => {
    if (!activeRig) return null;
    return {
      version: 1,
      parts: BODY_PARTS.map((part) => {
        const transform = settings.anatomyTransforms?.[part.id];
        return {
          id: part.id,
          parentId: settings.anatomyParents?.[part.id] ?? part.parentId,
          anchor: {
            ...(activeRig.anatomyAnchors[part.id]
              ?? { x: activeRig.width / 2, y: activeRig.height / 2 }),
          },
          rotation: transform?.rotation ?? 0,
          offset: { ...(transform?.offset ?? { x: 0, y: 0 }) },
          visible: transform?.visible !== false,
        };
      }),
      drawOrder: [...(settings.anatomyOrder ?? BODY_PARTS.map((part) => part.id))],
      maskRanges: Object.fromEntries(BODY_PARTS.map((part) => [
        part.id,
        encodeMaskRanges(activeRig.anatomyMask, BODY_PART_INDEX.get(part.id) ?? -1),
      ])),
    };
  };

  const exportAnatomicalRig = () => {
    if (!activeRig || !settings.anatomyEnabled) return;
    const anatomicalRig = createAnatomicalRigPayload();
    if (!anatomicalRig) return;
    const payload = {
      format: 'emperia-anatomical-rig',
      version: 1,
      source: {
        outfitId,
        direction: directionName,
        width: activeRig.width,
        height: activeRig.height,
      },
      anatomicalRig,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const poseName = (activePoseSet?.name ?? 'pose')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    anchor.href = url;
    anchor.download = `${poseName || 'pose'}-${directionName}-anatomical-rig.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setSaveStatus('Rig exported');
    window.setTimeout(() => setSaveStatus(''), 1200);
  };

  const importAnatomicalRig = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !activeRig) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        format?: string;
        version?: number;
        source?: { width?: number; height?: number };
        anatomicalRig?: AnatomicalRig;
      };
      if (
        parsed.format !== 'emperia-anatomical-rig'
        || parsed.version !== 1
        || parsed.anatomicalRig?.version !== 1
      ) {
        throw new Error('Unsupported anatomical rig file.');
      }
      if (
        parsed.source?.width !== activeRig.width
        || parsed.source?.height !== activeRig.height
      ) {
        throw new Error(
          `Rig is ${parsed.source?.width ?? '?'}x${parsed.source?.height ?? '?'}; current outfit is ${activeRig.width}x${activeRig.height}.`,
        );
      }

      const importedParts = new Map(parsed.anatomicalRig.parts.map((part) => [part.id, part]));
      const anatomyMask = new Uint8Array(activeRig.width * activeRig.height);
      const anatomyAnchors: Partial<Record<BodyPartId, Point>> = {};
      const transforms = createDefaultAnatomyTransforms();
      const parents = createDefaultAnatomyParents();

      for (const definition of BODY_PARTS) {
        const imported = importedParts.get(definition.id);
        if (imported) {
          anatomyAnchors[definition.id] = { ...imported.anchor };
          transforms[definition.id] = {
            rotation: imported.rotation,
            offset: { ...imported.offset },
            visible: imported.visible,
          };
          parents[definition.id] = imported.parentId;
        }
        const region = BODY_PART_INDEX.get(definition.id);
        const ranges = parsed.anatomicalRig.maskRanges[definition.id];
        if (!region || !ranges) continue;
        for (const token of ranges.split(',')) {
          const [startText, endText] = token.split('-');
          const start = Number(startText);
          const end = endText == null ? start : Number(endText);
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) {
            throw new Error(`Invalid mask range "${token}".`);
          }
          for (let index = start; index <= end && index < anatomyMask.length; index++) {
            anatomyMask[index] = region;
          }
        }
      }

      const knownIds = new Set(BODY_PARTS.map((part) => part.id));
      const order = parsed.anatomicalRig.drawOrder.filter(
        (id, index, values) => knownIds.has(id) && values.indexOf(id) === index,
      );
      for (const part of BODY_PARTS) {
        if (!order.includes(part.id)) order.push(part.id);
      }

      updateActiveRig((rig) => {
        rig.anatomyMask = anatomyMask;
        rig.anatomyAnchors = anatomyAnchors;
      });
      setSettings((current) => ({
        ...current,
        anatomyEnabled: true,
        anatomyTransforms: transforms,
        anatomyParents: parents,
        anatomyOrder: order,
      }));
      setSaveStatus('Rig imported · save the pose');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Could not import rig');
    }
    window.setTimeout(() => setSaveStatus(''), 3000);
  };

  const saveRigToEobj = () => {
    if (!activeRig || !activePoseSet) return;
    const rangeFor = (mask: Uint8Array, region: number) => {
      const ranges: string[] = [];
      let start = -1;
      let previous = -1;
      mask.forEach((value, index) => {
        if (value !== region) return;
        if (start < 0) {
          start = previous = index;
        } else if (index === previous + 1) {
          previous = index;
        } else {
          ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
          start = previous = index;
        }
      });
      if (start >= 0) ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
      return ranges.join(',');
    };
    const profile: SeatPoseProfile = {
      poseSetId: activePoseSet.id,
      action: poseAction,
      direction: directionName,
      width: activeRig.width,
      height: activeRig.height,
      horizontal: isHorizontalDirection(direction),
      hip: getPivotLine(activeRig, 'hip', direction),
      knee: getPivotLine(activeRig, 'knee', direction),
      ankle: getPivotLine(activeRig, 'ankle', direction),
      torsoAngle: settings.torsoAngle,
      hipAngle: settings.hipAngle,
      kneeAngle: settings.kneeAngle,
      bend: settings.bendX,
      shinBend: settings.shinBend ?? 0,
      hipSplitOffset: settings.hipSplitOffset,
      kneeSplitOffset: settings.kneeSplitOffset,
      torsoCut: getSegmentCut(settings, 1, direction),
      thighCut: getSegmentCut(settings, 2, direction),
      shinCut: getSegmentCut(settings, 3, direction),
      torsoLean: settings.torsoLean,
      segmentTransforms: structuredClone(settings.segmentTransforms),
      drawLayers: getSegmentOrder(settings).map((segment) => ({
        region: segment === 'torso' ? 1 : segment === 'thigh' ? 2 : 3,
        visible: settings.segmentVisibility?.[segment] !== false,
      })),
      playerOffset: { x: settings.playerX, y: settings.playerY },
      benchOffset: { x: settings.benchX, y: settings.benchY },
      maskRanges: {
        1: rangeFor(activeRig.mask, 1),
        2: rangeFor(activeRig.mask, 2),
        3: rangeFor(activeRig.mask, 3),
        4: rangeFor(activeRig.mask, 4),
        5: rangeFor(activeRig.mask, 5),
      },
      anatomicalRig: settings.anatomyEnabled
        ? {
            version: 1,
            parts: BODY_PARTS.map((part) => {
              const transform = settings.anatomyTransforms?.[part.id];
              return {
                id: part.id,
                parentId: settings.anatomyParents?.[part.id] ?? part.parentId,
                anchor: { ...(activeRig.anatomyAnchors[part.id] ?? { x: activeRig.width / 2, y: activeRig.height / 2 }) },
                rotation: transform?.rotation ?? 0,
                offset: { ...(transform?.offset ?? { x: 0, y: 0 }) },
                visible: transform?.visible !== false,
              };
            }),
            drawOrder: [...(settings.anatomyOrder ?? BODY_PARTS.map((part) => part.id))],
            maskRanges: Object.fromEntries(BODY_PARTS.map((part) => [
              part.id,
              rangeFor(activeRig.anatomyMask, BODY_PART_INDEX.get(part.id) ?? -1),
            ])),
          }
        : undefined,
    };
    updateSeatPoseProfile(profile);
    setSaveStatus('Saved');
    window.setTimeout(() => setSaveStatus(''), 1200);
  };

  const addPoseSet = (duplicate: boolean) => {
    const baseName = activePoseSet?.name
      ?? poseAction;
    const name = duplicate ? `${baseName} Copy` : `New ${baseName}`;
    const id = createPoseSet(
      poseAction,
      name,
      duplicate ? activePoseSet?.id : undefined,
    );
    if (id != null) {
      setPoseSetId(id);
      setPoseSetName(name);
    }
  };

  const bindReferenceToPoseSet = () => {
    if (referenceAppearanceId == null || !activePoseSet || poseAction !== 'sit') return;
    const emptyOffsets = {
      north: { x: 0, y: 0 },
      east: { x: 0, y: 0 },
      south: { x: 0, y: 0 },
      west: { x: 0, y: 0 },
    };
    updateItemSeatDefinition(referenceAppearanceId, {
      poseSetId: activePoseSet.id,
      directionMask: 1 << direction,
      offsets: {
        ...(referenceSeatDefinition?.offsets ?? emptyOffsets),
        [directionName]: { ...referenceItemOffset },
      },
    });
    setReferenceStatus(
      `Item ${benchItemId} → ${activePoseSet.name} · ${DIRECTION_LABELS[direction]}`,
    );
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
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-emperia-text">Pose Lab</h2>
            <HelpTooltip content={{
              title: 'Pose Lab',
              scope: 'Client',
              description: 'Creates reusable directional Pose Sets and stores their rig, masks, pivots and transforms inside the EOBJ.',
              example: 'Select Sit and a Pose Set, choose a direction, adjust it, save, then bind furniture items to that set.',
            }} />
          </div>
          {labMode === 'pose' && <button
            type="button"
            onClick={() => {
              setSettings(DEFAULT_SETTINGS);
              resetCurrentRig();
            }}
            title="Reset pose and current direction rig"
            className="rounded border border-emperia-border p-1.5 text-emperia-muted transition-colors hover:bg-emperia-hover hover:text-emperia-text"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>}
        </div>

        <div className="mb-3 grid grid-cols-2 gap-1 rounded border border-emperia-border bg-emperia-bg p-1">
          <button
            type="button"
            onClick={() => setLabMode('pose')}
            className={`rounded px-2 py-1.5 text-[9px] font-medium transition-colors ${
              labMode === 'pose'
                ? 'bg-emperia-accent/15 text-emperia-accent'
                : 'text-emperia-muted hover:bg-emperia-hover'
            }`}
          >
            1 · Create Pose
          </button>
          <button
            type="button"
            onClick={() => {
              setPoseAction('sit');
              setLabMode('bind');
            }}
            className={`rounded px-2 py-1.5 text-[9px] font-medium transition-colors ${
              labMode === 'bind'
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'text-emperia-muted hover:bg-emperia-hover'
            }`}
          >
            2 · Bind Item
          </button>
        </div>

        <div className={`${labMode === 'pose' ? '' : 'hidden'} mb-3 rounded border border-emperia-border/70 bg-emperia-surface/30 p-2`}>
          <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-wider text-emperia-muted">
            Profile
          </span>
          <div>
            <label className="flex min-w-0 flex-col gap-1 text-[9px] text-emperia-muted">
              Action
              <select
                value={poseAction}
                onChange={(event) => setPoseAction(event.target.value as PoseAction)}
                className="min-w-0 rounded border border-emperia-border bg-emperia-bg px-1.5 py-1 text-[10px] text-emperia-text"
              >
                <option value="sit">Sit</option>
                <option value="sit-ground">Sit on ground</option>
                <option value="attack">Attack</option>
              </select>
            </label>
          </div>
          <label className="mt-1.5 flex min-w-0 flex-col gap-1 text-[9px] text-emperia-muted">
            Pose Set
            <select
              value={poseSetId}
              onChange={(event) => setPoseSetId(Number(event.target.value))}
              className="min-w-0 rounded border border-emperia-border bg-emperia-bg px-1.5 py-1 text-[10px] text-emperia-text"
            >
              {matchingPoseSets.length === 0 && <option value={0}>No Pose Sets</option>}
              {matchingPoseSets.map((poseSet) => (
                <option key={poseSet.id} value={poseSet.id}>
                  {poseSet.name} (#{poseSet.id})
                </option>
              ))}
            </select>
          </label>
          <div className="mt-1.5 flex gap-1">
            <input
              type="text"
              value={poseSetName}
              onChange={(event) => setPoseSetName(event.target.value)}
              placeholder="Pose Set name"
              className="min-w-0 flex-1 rounded border border-emperia-border bg-emperia-bg px-1.5 py-1 text-[9px] text-emperia-text"
            />
            <button
              type="button"
              onClick={() => activePoseSet && renamePoseSet(activePoseSet.id, poseSetName)}
              disabled={!activePoseSet || !poseSetName.trim()}
              className="rounded border border-emperia-border px-1.5 text-[8px] text-emperia-muted hover:bg-emperia-hover disabled:opacity-35"
            >
              Rename
            </button>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => addPoseSet(false)}
              className="rounded border border-emperia-border px-1.5 py-1 text-[8px] text-emperia-muted hover:bg-emperia-hover"
            >
              New set
            </button>
            <button
              type="button"
              onClick={() => addPoseSet(true)}
              disabled={!activePoseSet}
              className="rounded border border-emperia-border px-1.5 py-1 text-[8px] text-emperia-muted hover:bg-emperia-hover disabled:opacity-35"
            >
              Duplicate set
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="truncate font-mono text-[8px] text-emperia-accent/80">
              #{poseSetId}:{directionName}
            </span>
            <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] ${
              storedProfile
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                : 'border-amber-500/50 bg-amber-500/10 text-amber-300'
            }`}>
              {storedProfile ? 'Saved' : 'Not saved'}
            </span>
          </div>
        </div>

        <div className={`${labMode === 'bind' ? '' : 'hidden'} mb-3 rounded border border-emerald-500/30 bg-emerald-500/5 p-2`}>
          <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
            Furniture binding
          </span>
          <div className="mb-2 rounded border border-emperia-border/70 bg-emperia-bg/60 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2 text-[9px]">
              <span className="text-emperia-muted">Reference item</span>
              <span className="font-mono text-emperia-text">#{benchItemId}</span>
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[8px]">
              <span className="text-emperia-muted">Current binding</span>
              <span className="truncate text-right text-emperia-text">
                {referenceSeatDefinition
                  ? objectData?.poseSets.get(referenceSeatDefinition.poseSetId)?.name
                    ?? `Pose Set #${referenceSeatDefinition.poseSetId}`
                  : 'None'}
              </span>
            </div>
          </div>
          <label className="flex min-w-0 flex-col gap-1 text-[9px] text-emperia-muted">
            Pose Set to apply
            <select
              value={poseSetId}
              onChange={(event) => setPoseSetId(Number(event.target.value))}
              className="min-w-0 rounded border border-emperia-border bg-emperia-bg px-1.5 py-1 text-[10px] text-emperia-text"
            >
              <option value={0}>
                {matchingPoseSets.length === 0 ? 'No Pose Sets' : 'Select a Pose Set'}
              </option>
              {matchingPoseSets.map((poseSet) => (
                <option key={poseSet.id} value={poseSet.id}>
                  {poseSet.name} (#{poseSet.id})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mb-4">
          <span className="mb-1.5 block text-[10px] text-emperia-muted">
            {labMode === 'pose' ? 'Direction-specific rig' : 'Direction to bind'}
          </span>
          <div className="grid grid-cols-4 gap-1">
            {DIRECTION_LABELS.map((label, index) => {
              const candidateDirection = index as Direction;
              const candidateName = label.toLowerCase() as SeatDirection;
              const available = objectData?.seatPoseProfiles.has(
                poseSetProfileKey(poseSetId, candidateName),
              ) ?? false;
              const status = available ? 'pose available' : 'pose missing';

              return (
                <button
                  type="button"
                  key={label}
                  onClick={() => setDirection(candidateDirection)}
                  title={`${label}: ${status}`}
                  className={`relative rounded border px-1 py-1 text-[10px] transition-colors ${
                    direction === index
                      ? 'border-emperia-accent bg-emperia-accent/15 text-emperia-accent'
                      : 'border-emperia-border text-emperia-muted hover:bg-emperia-hover'
                  }`}
                >
                  <span aria-hidden="true" className="text-sm leading-none">
                    {DIRECTION_ARROWS[candidateDirection]}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${
                      available
                        ? 'bg-emerald-400'
                        : 'border border-amber-400 bg-transparent'
                    }`}
                  />
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[8px] text-emperia-muted/70">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {labMode === 'pose' ? 'Saved' : 'Pose available'}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full border border-amber-400" />
              {labMode === 'pose' ? 'Not saved' : 'Pose missing'}
            </span>
          </div>
        </div>

        <details open className={`${labMode === 'pose' && !settings.anatomyEnabled ? '' : 'hidden'} mb-2 rounded border border-emperia-border/70 bg-emperia-surface/20`}>
          <summary className="cursor-pointer select-none px-2 py-2 text-[10px] font-medium text-emperia-text">
            Rotation
          </summary>
          <div className="flex flex-col gap-2.5 border-t border-emperia-border/60 p-2">
          <Slider label="Torso angle" value={settings.torsoAngle} min={-45} max={45} suffix="°"
            onChange={(value) => updateSetting('torsoAngle', value)} />
          <Slider label="Hip angle" value={settings.hipAngle} min={-120} max={120} suffix="°"
            onChange={(value) => updateSetting('hipAngle', value)} />
            <Slider label="Knee angle" value={settings.kneeAngle} min={-140} max={140} suffix="°"
              onChange={(value) => updateSetting('kneeAngle', value)} />
          </div>
        </details>

        <details open className={`${labMode === 'pose' && !settings.anatomyEnabled ? '' : 'hidden'} group mb-2 rounded border border-emperia-border/70 bg-emperia-surface/20`}>
          <summary className="cursor-pointer select-none px-2 py-2 text-[10px] font-medium text-emperia-text">
            Segment transform
          </summary>
          <div className="flex flex-col gap-2.5 border-t border-emperia-border/60 p-2">
            <div className="grid grid-cols-3 gap-1">
              {DEFAULT_SEGMENT_ORDER.map((segment) => (
                <button
                  key={segment}
                  type="button"
                  onClick={() => setTransformSegment(segment)}
                  className={`rounded border px-1 py-1 text-[9px] transition-colors ${
                    transformSegment === segment
                      ? 'border-emperia-accent bg-emperia-accent/15 text-emperia-accent'
                      : 'border-emperia-border text-emperia-muted hover:bg-emperia-hover'
                  }`}
                >
                  {SEGMENT_LABELS[segment]}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-2">
              <Slider label="Position X" value={getSegmentTransform(settings, transformSegment).translate.x}
                min={-32} max={32} suffix=" px"
                onChange={(value) => updateSegmentTransform('translate', 'x', value)} />
              <Slider label="Position Y" value={getSegmentTransform(settings, transformSegment).translate.y}
                min={-32} max={32} suffix=" px"
                onChange={(value) => updateSegmentTransform('translate', 'y', value)} />
              <Slider label="Scale X" value={getSegmentTransform(settings, transformSegment).scale.x}
                min={50} max={150} suffix="%"
                onChange={(value) => updateSegmentTransform('scale', 'x', value)} />
              <Slider label="Scale Y" value={getSegmentTransform(settings, transformSegment).scale.y}
                min={50} max={150} suffix="%"
                onChange={(value) => updateSegmentTransform('scale', 'y', value)} />
              <Slider label="Skew X" value={getSegmentTransform(settings, transformSegment).skew.x}
                min={-30} max={30} suffix="°"
                onChange={(value) => updateSegmentTransform('skew', 'x', value)} />
              <Slider label="Skew Y" value={getSegmentTransform(settings, transformSegment).skew.y}
                min={-30} max={30} suffix="°"
                onChange={(value) => updateSegmentTransform('skew', 'y', value)} />
            </div>
            <button
              type="button"
              onClick={resetSegmentTransform}
              className="rounded border border-emperia-border px-2 py-1 text-[9px] text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text"
            >
              Reset {SEGMENT_LABELS[transformSegment]}
            </button>
          </div>
        </details>

        <details className={`${labMode === 'pose' && !settings.anatomyEnabled ? '' : 'hidden'} mb-2 rounded border border-emperia-border/70 bg-emperia-surface/20`}>
          <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2 py-2">
            <span className="text-[10px] font-medium text-emperia-text">Warp & cuts</span>
            <HelpTooltip content={{
              title: 'Warp and cut axes',
              scope: 'Client',
              description: isHorizontalDirection(direction)
                ? 'For East and West, splits use the X axis and bends use Y. Cuts can move freely on both axes.'
                : 'For this view, splits use the Y axis and bends use X. Cuts can move freely on both axes.',
              example: 'Move a segment cut in X and Y to reconnect a separated thigh after rotating the hip.',
            }} />
          </summary>
          <div className="flex flex-col gap-2.5 border-t border-emperia-border/60 p-2">
          <Slider label="Torso bend" value={settings.torsoLean} min={-40} max={40} suffix=" px"
            onChange={(value) => updateSetting('torsoLean', value)} />
          <Slider label="Thigh bend" value={settings.bendX} min={-40} max={40} suffix=" px"
            onChange={(value) => updateSetting('bendX', value)} />
          <Slider label="Shin bend" value={settings.shinBend ?? 0} min={-40} max={40} suffix=" px"
            onChange={(value) => updateSetting('shinBend', value)} />
          <Slider label="Hip split" value={settings.hipSplitOffset} min={-24} max={24} suffix=" px"
            onChange={(value) => updateSetting('hipSplitOffset', value)} />
          <Slider label="Knee split" value={settings.kneeSplitOffset} min={-24} max={24} suffix=" px"
            onChange={(value) => updateSetting('kneeSplitOffset', value)} />
          <div>
            <div className="mb-2 flex items-center justify-between text-[10px] text-emperia-muted">
              <span className="flex items-center gap-1.5">
                Segment cuts
                <HelpTooltip content={{
                  title: 'Segment cut position',
                  scope: 'Client',
                  description: 'Drag each analog control in X and Y to reposition the corresponding cut segment.',
                  example: 'Drag Thigh cut left and down to reconnect it to the hip after rotation. Double-click the pad to reset it.',
                }} />
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <AnalogPositionControl
                label="Torso cut"
                value={getSegmentCut(settings, 1, direction)}
                onChange={(value) => updateSetting('torsoCut', value)}
              />
              <AnalogPositionControl
                label="Thigh cut"
                value={getSegmentCut(settings, 2, direction)}
                onChange={(value) => updateSetting('thighCut', value)}
              />
              <AnalogPositionControl
                label="Shin cut"
                value={getSegmentCut(settings, 3, direction)}
                onChange={(value) => updateSetting('shinCut', value)}
              />
            </div>
          </div>
          </div>
        </details>

        <details className={`${labMode === 'pose' ? '' : 'hidden'} rounded border border-emperia-border/70 bg-emperia-surface/20`}>
          <summary className="cursor-pointer select-none px-2 py-2 text-[10px] font-medium text-emperia-text">
            Furniture preview
          </summary>
          <div className="flex flex-col gap-2.5 border-t border-emperia-border/60 p-2">
            <span className="text-[9px] text-emperia-muted">
              Editor preview only. These values are not bound to the item.
            </span>
            <Slider label="Preview X" value={settings.benchX} min={-64} max={64} suffix=" px"
              onChange={(value) => updateSetting('benchX', value)} />
            <Slider label="Preview Y" value={settings.benchY} min={-64} max={64} suffix=" px"
              onChange={(value) => updateSetting('benchY', value)} />
          </div>
        </details>

        <details open className={`${labMode === 'bind' ? '' : 'hidden'} rounded border border-emperia-border/70 bg-emperia-surface/20`}>
          <summary className="cursor-pointer select-none px-2 py-2 text-[10px] font-medium text-emperia-text">
            Placement · item {benchItemId}
          </summary>
          <div className="flex flex-col gap-2.5 border-t border-emperia-border/60 p-2">
          <span className="flex items-center gap-1.5 text-[9px] text-emperia-muted">
            Per-item player position
            <HelpTooltip content={{
              title: 'Per-item player position',
              scope: 'Client',
              description: 'Player X/Y is stored on this furniture item, not on the shared Pose Set. Other items using the same pose keep their own values.',
              example: 'Items 1649 and 1650 can both use Pose Set 7 while keeping completely different X/Y alignment.',
            }} />
          </span>
          <Slider label="Player X" value={referenceItemOffset.x} min={-64} max={64} suffix=" px"
            onChange={(value) => updateReferenceItemOffset('x', value)} />
          <Slider label="Player Y" value={referenceItemOffset.y} min={-64} max={64} suffix=" px"
            onChange={(value) => updateReferenceItemOffset('y', value)} />
          </div>
        </details>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center overflow-auto p-4">
        <div className="sticky top-0 z-30 mb-3 w-full shrink-0 rounded border border-emperia-border/80 bg-emperia-panel/95 p-2 shadow-lg backdrop-blur">
          <div className="flex flex-wrap items-end justify-center gap-2">
            <NumberField label="Base outfit ID" value={outfitId} onChange={setOutfitId} min={1} />
            <NumberField
              label={labMode === 'pose' ? 'Preview item ID' : 'Furniture item ID'}
              value={benchItemId}
              onChange={setBenchItemId}
              min={1}
            />
            <button
              type="button"
              onClick={useSelectedItemAsReference}
              disabled={selectedReferenceItemId == null}
              className="flex h-[26px] items-center justify-center gap-1.5 rounded border border-emperia-border px-3 text-[9px] text-emperia-muted transition-colors hover:bg-emperia-hover hover:text-emperia-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              <MousePointer2 className="h-3 w-3" />
              {labMode === 'pose' ? 'Use selected as preview' : 'Use selected furniture'}
            </button>
            <div className="mb-1">
              <HelpTooltip content={{
                title: 'Reference item',
                scope: 'Client',
                description: labMode === 'pose'
                  ? 'Uses the selected item only as a visual preview. It does not replace the Pose Set being edited.'
                  : 'Loads the selected furniture, its current Pose Set binding and a compatible direction.',
                example: labMode === 'pose'
                  ? 'Preview several chairs while continuing to edit the same reusable pose.'
                  : 'Select chair 1650, choose the Pose Set and direction, adjust its item offset, then bind it.',
                note: 'Configure the item Seating section in Properties first when no direction can be detected.',
              }} />
            </div>
          </div>
          {referenceStatus && (
            <div className="mt-1.5 truncate text-center text-[8px] text-emperia-muted/70">
              {referenceStatus}
            </div>
          )}
        </div>

        {(resolved.outfitError || resolved.benchError) && (
          <div className="mb-3 w-full max-w-3xl rounded border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-[10px] text-amber-300">
            {resolved.outfitError && <div>{resolved.outfitError}</div>}
            {resolved.benchError && <div>{resolved.benchError}</div>}
          </div>
        )}

        <div className="flex min-h-max min-w-max flex-1 items-center justify-center">
          <div className="checkerboard shrink-0 rounded-lg border border-emperia-border p-2 shadow-2xl">
            <canvas
              ref={canvasRef}
              width={320}
              height={240}
              className="block"
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
          <span><span className="text-yellow-300">■</span> Locked</span>
          <span><span className="text-rose-400">■</span> Hidden</span>
          <span>Base body · frame 0 · {DIRECTION_LABELS[direction]}</span>
        </div>
      </main>

      <aside className="w-64 shrink-0 overflow-y-auto border-l border-emperia-border p-3">
        <div className={labMode === 'pose' ? '' : 'hidden'}>
        <div className="mb-3 flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-emperia-text">Editing view</h3>
          <HelpTooltip content={{
            title: 'Editing view',
            scope: 'Client',
            description: 'Zoom changes only the editor display. Every painted square still represents one source pixel.',
            example: 'At 8x zoom, a brush size of 1 still changes exactly one pixel in the source outfit.',
          }} />
        </div>

        {settings.anatomyEnabled && (
          <div className="mb-4 border-b border-emperia-border pb-4">
            <div className="mb-1 flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-emperia-text">Rig transform editor</span>
              <HelpTooltip content={{
                title: 'Direct rig manipulation',
                scope: 'Client',
                description: 'Click a body node to select it. Drag the center node to move the part, or drag the outer ring and white handle to rotate it.',
                example: 'Drag the hand node to reposition the hand, then drag its white rotation handle to change its angle.',
              }} />
            </div>
            <div className="mb-2 text-[8px] text-emperia-muted">
              Drag node to move · drag ring to rotate
            </div>
            <div className="relative aspect-square w-full overflow-hidden rounded border border-emperia-border bg-black/20">
              <canvas
                ref={rigControlCanvasRef}
                width={RIG_CONTROL_CANVAS_SIZE}
                height={RIG_CONTROL_CANVAS_SIZE}
                onPointerDown={handleRigControlPointerDown}
                onPointerMove={handleRigControlPointerMove}
                onPointerUp={stopRigControlTransform}
                onPointerCancel={stopRigControlTransform}
                className="block h-full w-full cursor-crosshair touch-none"
                style={{ imageRendering: 'pixelated' }}
              />
              <svg
                viewBox={`0 0 ${RIG_CONTROL_CANVAS_SIZE} ${RIG_CONTROL_CANVAS_SIZE}`}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden"
              >
                {rigControlNodes.map((node) => {
                  const selected = node.id === selectedBodyPart;
                  const handleAngle = node.worldRotation - Math.PI / 2;
                  const handleX = node.x + Math.cos(handleAngle) * 9;
                  const handleY = node.y + Math.sin(handleAngle) * 9;
                  return (
                    <g key={node.id}>
                      {selected && (
                        <>
                          <circle
                            cx={node.x}
                            cy={node.y}
                            r="7"
                            fill="rgba(15,23,42,0.16)"
                            stroke="rgba(255,255,255,0.82)"
                            strokeWidth="0.55"
                            strokeDasharray="1.3 1.3"
                          />
                          <line
                            x1={node.x}
                            y1={node.y}
                            x2={handleX}
                            y2={handleY}
                            stroke="rgba(255,255,255,0.88)"
                            strokeWidth="0.65"
                          />
                          <circle
                            cx={handleX}
                            cy={handleY}
                            r="1.8"
                            fill="#f8fafc"
                            stroke={node.color}
                            strokeWidth="0.8"
                          />
                          <line
                            x1={node.x - 3.8}
                            y1={node.y}
                            x2={node.x + 3.8}
                            y2={node.y}
                            stroke={node.color}
                            strokeWidth="0.55"
                          />
                          <line
                            x1={node.x}
                            y1={node.y - 3.8}
                            x2={node.x}
                            y2={node.y + 3.8}
                            stroke={node.color}
                            strokeWidth="0.55"
                          />
                          <g transform={`translate(${node.x + 8} ${node.y - 6})`}>
                            <rect
                              x="0"
                              y="-4"
                              width="15"
                              height="5.5"
                              rx="1.8"
                              fill="rgba(3,7,18,0.92)"
                              stroke="rgba(255,255,255,0.25)"
                              strokeWidth="0.4"
                            />
                            <text
                              x="7.5"
                              y="-0.15"
                              textAnchor="middle"
                              fill="#f8fafc"
                              fontSize="3.2"
                              fontFamily="monospace"
                            >
                              {node.rotation}°
                            </text>
                          </g>
                        </>
                      )}
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={selected ? 2.25 : 1.75}
                        fill="rgba(3,7,18,0.94)"
                        stroke={selected ? '#ffffff' : 'rgba(255,255,255,0.72)'}
                        strokeWidth={selected ? 0.75 : 0.5}
                      />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={selected ? 1.25 : 0.95}
                        fill={node.color}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}

        <div className="mb-4 border-b border-emperia-border pb-4">
          <Slider label="Painting zoom" value={ghostZoom} min={1} max={12} suffix="x" onChange={setGhostZoom} />
          <div className="mt-3">
            <Slider label="Brush size" value={brushSize} min={1} max={15} suffix=" px" onChange={setBrushSize} />
          </div>
        </div>

        <div className="mb-4 border-b border-emperia-border pb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-emperia-text">
              Anatomical rig
              <HelpTooltip content={{
                title: 'Articulated body rig',
                scope: 'Client',
                description: 'Paint each body part, place its joint anchor, then rotate or move it. Child parts inherit the movement of their parent.',
                example: 'Paint Left forearm, choose Set anchor and click the elbow, then rotate the forearm.',
                note: 'This is optional. Turning it off keeps the legacy Torso / Thigh / Shin rig unchanged.',
              }} />
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 text-[9px] text-emperia-muted">
              <input
                type="checkbox"
                checked={settings.anatomyEnabled}
                onChange={(event) => updateSetting('anatomyEnabled', event.target.checked)}
                className="accent-emperia-accent"
              />
              Enable
            </label>
          </div>

          {settings.anatomyEnabled && (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-1">
                {BODY_PARTS.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    onClick={() => setSelectedBodyPart(part.id)}
                    className={`truncate rounded border px-1.5 py-1 text-left text-[8px] ${
                      selectedBodyPart === part.id
                        ? 'border-white/70 bg-white/10 text-white'
                        : 'border-emperia-border text-emperia-muted hover:bg-emperia-hover'
                    }`}
                    style={selectedBodyPart === part.id ? { color: part.color } : undefined}
                    title={part.label}
                  >
                    <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: part.color }} />
                    {part.shortLabel}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-1">
                {([
                  ['paint', 'Paint area'],
                  ['anchor', 'Set anchor'],
                  ['erase', 'Erase'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setAnatomyEditMode(mode);
                      if (mode === 'anchor') updateSetting('showPivots', true);
                      else updateSetting('showMasks', true);
                    }}
                    className={`rounded border px-1 py-1 text-[8px] ${
                      anatomyEditMode === mode
                        ? 'border-emperia-accent bg-emperia-accent/15 text-emperia-accent'
                        : 'border-emperia-border text-emperia-muted hover:bg-emperia-hover'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="rounded border border-emperia-border/70 bg-emperia-bg/40 p-2">
                <div className="mb-2 flex items-center justify-between text-[9px]">
                  <span style={{ color: BODY_PART_BY_ID.get(selectedBodyPart)?.color }}>
                    {BODY_PART_BY_ID.get(selectedBodyPart)?.label}
                  </span>
                  <span className="text-emperia-muted">
                    Parent: {settings.anatomyParents?.[selectedBodyPart]
                      ? BODY_PART_BY_ID.get(settings.anatomyParents[selectedBodyPart]!)?.shortLabel
                      : 'Detached'}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <Slider
                    label="Rotation"
                    value={settings.anatomyTransforms?.[selectedBodyPart]?.rotation ?? 0}
                    min={-180}
                    max={180}
                    suffix="°"
                    onChange={(rotation) => updateBodyPartTransform({ rotation })}
                  />
                  <Slider
                    label="Position X"
                    value={settings.anatomyTransforms?.[selectedBodyPart]?.offset.x ?? 0}
                    min={-64}
                    max={64}
                    suffix=" px"
                    onChange={(x) => updateBodyPartTransform({ offset: { x } })}
                  />
                  <Slider
                    label="Position Y"
                    value={settings.anatomyTransforms?.[selectedBodyPart]?.offset.y ?? 0}
                    min={-64}
                    max={64}
                    suffix=" px"
                    onChange={(y) => updateBodyPartTransform({ offset: { y } })}
                  />
                </div>
                <div className="mt-2 grid grid-cols-[1fr_28px_28px] gap-1">
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-1 text-[8px] text-emperia-muted">
                      <input
                        type="checkbox"
                        checked={settings.anatomyTransforms?.[selectedBodyPart]?.visible !== false}
                        onChange={(event) => updateBodyPartTransform({ visible: event.target.checked })}
                        className="accent-emperia-accent"
                      />
                      Render part
                    </label>
                    {BODY_PART_BY_ID.get(selectedBodyPart)?.parentId && (
                      <label className="flex items-center gap-1 text-[8px] text-emperia-muted">
                        <input
                          type="checkbox"
                          checked={(settings.anatomyParents?.[selectedBodyPart] ?? BODY_PART_BY_ID.get(selectedBodyPart)?.parentId) != null}
                          onChange={(event) => setBodyPartAttached(event.target.checked)}
                          className="accent-emperia-accent"
                        />
                        Follow parent
                      </label>
                    )}
                  </div>
                  <button type="button" onClick={() => moveBodyPartLayer(-1)}
                    className="rounded border border-emperia-border text-[9px] text-emperia-muted hover:bg-emperia-hover">↑</button>
                  <button type="button" onClick={() => moveBodyPartLayer(1)}
                    className="rounded border border-emperia-border text-[9px] text-emperia-muted hover:bg-emperia-hover">↓</button>
                </div>
                <button
                  type="button"
                  onClick={() => updateBodyPartTransform({ rotation: 0, offset: { x: 0, y: 0 }, visible: true })}
                  className="mt-2 w-full rounded border border-emperia-border px-2 py-1 text-[8px] text-emperia-muted hover:bg-emperia-hover"
                >
                  Reset selected part transform
                </button>
                <button
                  type="button"
                  onClick={resetAllBodyPartTransforms}
                  className="mt-1 w-full rounded border border-emperia-border px-2 py-1 text-[8px] text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text"
                >
                  Reset all part transforms
                </button>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={exportAnatomicalRig}
                    className="flex items-center justify-center gap-1 rounded border border-emperia-border px-1.5 py-1 text-[8px] text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text"
                  >
                    <Download className="h-3 w-3" />
                    Export rig
                  </button>
                  <button
                    type="button"
                    onClick={() => anatomicalRigImportRef.current?.click()}
                    className="flex items-center justify-center gap-1 rounded border border-emperia-border px-1.5 py-1 text-[8px] text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text"
                  >
                    <Upload className="h-3 w-3" />
                    Import rig
                  </button>
                  <input
                    ref={anatomicalRigImportRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={importAnatomicalRig}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mb-4 border-b border-emperia-border pb-4">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-emperia-text">Ghost source editor</span>
            <HelpTooltip content={{
              title: 'Independent ghost canvas',
              scope: 'Client',
              description: 'Masks and pivot lines are edited on this source canvas. The central canvas displays only the deformed result.',
              example: 'Paint the arm as Locked here while watching the resulting seated pose in the center.',
            }} />
          </div>
          <div className="max-h-64 overflow-auto rounded border border-emperia-border bg-black/20">
            <canvas
              ref={ghostCanvasRef}
              width={resolved.outfit?.width ?? 64}
              height={resolved.outfit?.height ?? 64}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopPainting}
              onPointerCancel={stopPainting}
              onPointerLeave={stopPainting}
              className={settings.showMasks || settings.showPivots ? 'block cursor-crosshair touch-none' : 'block'}
              style={{
                width: (resolved.outfit?.width ?? 64) * ghostZoom,
                height: (resolved.outfit?.height ?? 64) * ghostZoom,
                imageRendering: 'pixelated',
              }}
            />
          </div>
        </div>

        <div className={`${settings.anatomyEnabled ? 'hidden ' : ''}mb-4 border-b border-emperia-border pb-4`}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[10px] font-medium text-emperia-text">Draw layers</span>
            <HelpTooltip content={{
              title: 'Draw layers',
              scope: 'Client',
              description: 'Segments are drawn from top to bottom. The last visible row appears in front, while Locked pixels always render last.',
              example: 'Move Torso below Thigh when the seated leg must appear in front of the body.',
            }} />
          </div>
          <div className="flex flex-col gap-1">
            {getSegmentOrder(settings).map((segment, index, order) => (
              <div
                key={segment}
                className="grid grid-cols-[18px_1fr_24px_24px] items-center gap-1 rounded border border-emperia-border px-1.5 py-1"
              >
                <input
                  type="checkbox"
                  checked={settings.segmentVisibility?.[segment] !== false}
                  onChange={(event) => setSegmentVisible(segment, event.target.checked)}
                  aria-label={`Render ${SEGMENT_LABELS[segment]}`}
                  className="accent-emperia-accent"
                />
                <span className="text-[9px] text-emperia-text">{SEGMENT_LABELS[segment]}</span>
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => moveSegmentLayer(segment, -1)}
                  aria-label={`Move ${SEGMENT_LABELS[segment]} earlier`}
                  className="rounded border border-emperia-border text-[10px] text-emperia-muted hover:bg-emperia-hover disabled:opacity-25"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === order.length - 1}
                  onClick={() => moveSegmentLayer(segment, 1)}
                  aria-label={`Move ${SEGMENT_LABELS[segment]} later`}
                  className="rounded border border-emperia-border text-[10px] text-emperia-muted hover:bg-emperia-hover disabled:opacity-25"
                >
                  ↓
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className={`${settings.anatomyEnabled ? 'hidden ' : ''}mb-4 border-b border-emperia-border pb-4`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-emperia-text">
              Masks
              <HelpTooltip content={{
                title: 'Pose masks',
                scope: 'Client',
                description: 'Mask coordinates follow the original ghost. Locked pixels remain unchanged and render last; Hidden pixels are omitted.',
                example: 'Paint both arms as Locked to keep them intact while the torso and legs are warped.',
              }} />
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 text-[9px] text-emperia-muted">
              <input
                type="checkbox"
                checked={settings.showMasks}
                onChange={(event) => updateSetting('showMasks', event.target.checked)}
                className="accent-emperia-accent"
              />
              Show
            </label>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {toolButton('torso', 'Torso', 'bg-red-400/15 text-red-300')}
            {toolButton('thigh', 'Thigh', 'bg-green-400/15 text-green-300')}
            {toolButton('shin', 'Shin / feet', 'bg-blue-400/15 text-blue-300')}
            {toolButton('locked', 'Locked / arms', 'bg-yellow-400/15 text-yellow-300')}
            {toolButton('hidden', 'Hidden / no draw', 'bg-rose-500/15 text-rose-300')}
            {toolButton('erase', 'Auto / clear', 'bg-emperia-hover text-emperia-text')}
          </div>
        </div>

        <div className={`${settings.anatomyEnabled ? 'hidden ' : ''}mb-4 border-b border-emperia-border pb-4`}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-emperia-text">
              Pivots
              <HelpTooltip content={{
                title: 'Pivot lines',
                scope: 'Client',
                description: 'Select a joint and drag across the ghost to define the angled pivot line. Its midpoint becomes the rotation anchor.',
                example: 'Draw the knee line along the sprite perspective before changing Knee angle.',
              }} />
            </span>
            <label className="flex cursor-pointer items-center gap-1.5 text-[9px] text-emperia-muted">
              <input
                type="checkbox"
                checked={settings.showPivots}
                onChange={(event) => updateSetting('showPivots', event.target.checked)}
                className="accent-emperia-accent"
              />
              Show
            </label>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {toolButton('hip', 'Hip', 'bg-amber-400/15 text-amber-300')}
            {toolButton('knee', 'Knee', 'bg-violet-400/15 text-violet-300')}
            {toolButton('ankle', 'Ankle', 'bg-cyan-400/15 text-cyan-300')}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={saveRigToEobj}
            disabled={!activeRig || !activePoseSet}
            className="flex items-center justify-center gap-1.5 rounded border border-emperia-accent/60 bg-emperia-accent/10 px-2 py-1.5 text-[10px] text-emperia-accent disabled:opacity-40"
          >
            <Save className="h-3 w-3" />
            {saveStatus || `Save ${activePoseSet?.name ?? 'Pose Set'} · ${directionName}`}
          </button>
          <button
            type="button"
            onClick={resetCurrentRig}
            className="rounded border border-emperia-border px-2 py-1.5 text-[10px] text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text"
          >
            Auto reset masks & pivots
          </button>
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
        </div>

        <div className={labMode === 'bind' ? '' : 'hidden'}>
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-emperia-text">Bind pose to furniture</h3>
            <p className="mt-1 text-[9px] leading-relaxed text-emperia-muted">
              This does not edit the Pose Set. It only links this item and stores its individual player offset.
            </p>
          </div>
          <div className="mb-3 rounded border border-emperia-border bg-emperia-surface/20 p-2 text-[9px]">
            <div className="flex justify-between gap-2">
              <span className="text-emperia-muted">Item</span>
              <span className="font-mono text-emperia-text">#{benchItemId}</span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-emperia-muted">Pose Set</span>
              <span className="truncate text-right text-emperia-text">
                {activePoseSet?.name ?? 'None selected'}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-emperia-muted">Direction</span>
              <span className="text-emperia-text">{DIRECTION_LABELS[direction]}</span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span className="text-emperia-muted">Player offset</span>
              <span className="font-mono text-emperia-text">
                {referenceItemOffset.x}, {referenceItemOffset.y}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={bindReferenceToPoseSet}
            disabled={referenceAppearanceId == null || !activePoseSet || !storedProfile || poseAction !== 'sit'}
            className="w-full rounded border border-emerald-500/60 bg-emerald-500/10 px-2 py-2 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-35"
          >
            Bind #{benchItemId} to {activePoseSet?.name ?? 'Pose Set'} · {DIRECTION_LABELS[direction]}
          </button>
        </div>
      </aside>
    </div>
  );
}
