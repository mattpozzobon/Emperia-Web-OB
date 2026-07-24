/**
 * Compile pipeline: generate and validate every artifact before replacing files.
 */
import { useOBStore } from '../store';
import { parseObjectData } from './object-parser';
import { compileObjectData } from './object-writer';
import { compileSpriteData } from './sprite-writer';
import { parseSpriteData } from './sprite-decoder';
import { gzipCompress } from './emperia-format';
import { compileItemsOtb } from './otb-writer';
import { compileItemsXml } from './items-xml-writer';
import { verifyPermission } from './dir-handle-store';
import type { ObjectData, SpriteData } from './types';

export interface CompileStep {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  elapsed?: number;
  error?: string;
  size?: number;
}

export interface CompileOutput {
  name: string;
  destination: string;
  size: number;
}

export interface CompileState {
  active: boolean;
  steps: CompileStep[];
  outputs: CompileOutput[];
  currentStep: number;
  startTime: number;
  endTime?: number;
  totalElapsed: number;
}

export const STEP_LABELS = [
  'Objects (.eobj)',
  'Sprites (.espr)',
  'Version Manifest',
  'Definitions (.json)',
  'Sprite Map (.json)',
  'Items OTB (.otb)',
  'Items XML (.xml)',
  'Hair Definitions',
  'Validate & Save',
] as const;

export const INITIAL_COMPILE_STATE: CompileState = {
  active: false,
  steps: STEP_LABELS.map((label) => ({ label, status: 'pending' as const })),
  outputs: [],
  currentStep: -1,
  startTime: 0,
  totalElapsed: 0,
};

type ArtifactRole = 'obj' | 'spr' | 'def' | 'spriteMap' | 'hairDefs' | 'generated';

interface CompiledArtifact {
  role: ArtifactRole;
  name: string;
  buf: ArrayBuffer;
}

interface StagedFile {
  artifact: CompiledArtifact;
  tempName: string;
  previous: ArrayBuffer | null;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAssetVersion(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `1.0.${[
    String(now.getUTCFullYear()).slice(-2),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
  ].join('')}`;
}

function encodeText(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

function validateJson(buf: ArrayBuffer, label: string): void {
  try {
    JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function validateXml(buf: ArrayBuffer): void {
  const document = new DOMParser().parseFromString(new TextDecoder().decode(buf), 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.tagName !== 'items') {
    throw new Error('items.xml is not valid XML.');
  }
}

async function writeAndVerify(
  handle: FileSystemFileHandle,
  buf: ArrayBuffer,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(buf);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
  const saved = await handle.getFile();
  if (saved.size !== buf.byteLength) {
    throw new Error(`Write verification failed for ${handle.name}: expected ${buf.byteLength}, got ${saved.size}.`);
  }
}

async function readExisting(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<ArrayBuffer | null> {
  try {
    const handle = await dir.getFileHandle(name);
    return await (await handle.getFile()).arrayBuffer();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') return null;
    throw error;
  }
}

async function cleanupTempFiles(
  dir: FileSystemDirectoryHandle,
  staged: StagedFile[],
): Promise<void> {
  await Promise.all(staged.map(({ tempName }) =>
    dir.removeEntry(tempName).catch(() => undefined),
  ));
}

async function stageDirectory(
  dir: FileSystemDirectoryHandle,
  artifacts: CompiledArtifact[],
): Promise<StagedFile[]> {
  const staged: StagedFile[] = [];
  try {
    for (const artifact of artifacts) {
      try {
        const tempName = `.${artifact.name}.emperia-tmp`;
        const previous = await readExisting(dir, artifact.name);
        const tempHandle = await dir.getFileHandle(tempName, { create: true });
        await writeAndVerify(tempHandle, artifact.buf);
        staged.push({ artifact, tempName, previous });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not stage "${artifact.name}" in "${dir.name}": ${detail}`);
      }
    }
    return staged;
  } catch (error) {
    await cleanupTempFiles(dir, staged);
    throw error;
  }
}

async function writeRotatingBackup(
  sourceDir: FileSystemDirectoryHandle,
  staged: StagedFile[],
): Promise<void> {
  if (sourceDir.name.toLowerCase() === 'backup') {
    throw new Error('The source folder cannot be the backup folder.');
  }
  const files = staged.filter((entry) => entry.previous !== null);
  if (files.length === 0) return;

  const backupDir = await sourceDir.getDirectoryHandle('backup', { create: true });
  for (const { artifact, previous } of files) {
    const backupHandle = await backupDir.getFileHandle(artifact.name, { create: true });
    await writeAndVerify(backupHandle, previous!);
  }
}

async function commitDirectory(
  dir: FileSystemDirectoryHandle,
  staged: StagedFile[],
): Promise<void> {
  try {
    for (const { artifact } of staged) {
      try {
        const finalHandle = await dir.getFileHandle(artifact.name, { create: true });
        await writeAndVerify(finalHandle, artifact.buf);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not replace "${artifact.name}" in "${dir.name}": ${detail}`);
      }
    }
  } catch (error) {
    // The File System Access API has no atomic rename. Restore every original
    // target if a final write fails, giving the batch transactional behavior.
    for (const { artifact, previous } of staged) {
      try {
        if (previous === null) {
          await dir.removeEntry(artifact.name);
        } else {
          const handle = await dir.getFileHandle(artifact.name, { create: true });
          await writeAndVerify(handle, previous);
        }
      } catch (restoreError) {
        console.error(`[OB] Failed to restore ${artifact.name}:`, restoreError);
      }
    }
    throw error;
  } finally {
    await cleanupTempFiles(dir, staged);
  }
}

async function saveDirectoryBatch(
  dir: FileSystemDirectoryHandle,
  artifacts: CompiledArtifact[],
  createBackup: boolean,
): Promise<void> {
  const staged = await stageDirectory(dir, artifacts);
  try {
    if (createBackup) await writeRotatingBackup(dir, staged);
    await commitDirectory(dir, staged);
  } catch (error) {
    await cleanupTempFiles(dir, staged);
    throw error;
  }
}

const downloadQueue: { buffer: ArrayBuffer; filename: string }[] = [];
let downloadTimer: number | null = null;

function flushDownloadQueue(): void {
  if (downloadQueue.length === 0) {
    downloadTimer = null;
    return;
  }
  const { buffer, filename } = downloadQueue.shift()!;
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  downloadTimer = window.setTimeout(flushDownloadQueue, 150);
}

function downloadFile(buffer: ArrayBuffer, filename: string): void {
  downloadQueue.push({ buffer, filename });
  if (downloadTimer === null) flushDownloadQueue();
}

export async function runCompile(
  setCompile: React.Dispatch<React.SetStateAction<CompileState>>,
  markClean: () => void,
): Promise<void> {
  const state = useOBStore.getState();
  const {
    objectData: od,
    spriteData: sd,
    dirtyIds,
    spriteOverrides,
    itemDefinitions,
    sourceDir,
    sourceNames,
    sourceHandles,
    outputDirs,
  } = state;
  if (!od || !sd) return;

  const artifacts: CompiledArtifact[] = [];
  let reparsedObject: ObjectData | null = null;
  let reparsedSprite: SpriteData | null = null;
  const startTime = performance.now();
  const steps: CompileStep[] = STEP_LABELS.map((label) => ({ label, status: 'pending' }));
  const outputs: CompileOutput[] = [];
  // Start permission checks while the Compile click still carries user
  // activation. Persisted directory handles may need permission renewed.
  const sourcePermission = sourceDir
    ? verifyPermission(sourceDir, 'readwrite').catch(() => false)
    : Promise.resolve(true);
  const outputPermissions = outputDirs.map((dir) => ({
    dir,
    allowed: verifyPermission(dir.handle, 'readwrite').catch(() => false),
  }));

  setCompile({
    active: true,
    steps: [...steps],
    outputs: [],
    currentStep: 0,
    startTime,
    totalElapsed: 0,
  });

  function publish(idx: number, patch: Partial<CompileStep>): void {
    Object.assign(steps[idx], patch);
    setCompile((previous) => ({
      ...previous,
      steps: [...steps],
      outputs: [...outputs],
      currentStep: idx,
      totalElapsed: performance.now() - startTime,
    }));
  }

  async function runStep(idx: number, operation: () => Promise<number | void>): Promise<boolean> {
    publish(idx, { status: 'running', error: undefined });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stepStart = performance.now();
    try {
      const size = await operation();
      publish(idx, {
        status: 'done',
        elapsed: performance.now() - stepStart,
        size: typeof size === 'number' ? size : undefined,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[OB] Step "${steps[idx].label}" failed:`, error);
      publish(idx, {
        status: 'error',
        elapsed: performance.now() - stepStart,
        error: message,
      });
      return false;
    }
  }

  function skipStep(idx: number): void {
    publish(idx, { status: 'skipped' });
  }

  function finish(): void {
    const endTime = performance.now();
    setCompile((previous) => ({
      ...previous,
      active: false,
      outputs: [...outputs],
      endTime,
      totalElapsed: endTime - startTime,
    }));
  }

  function abortGeneration(failedAt: number): void {
    for (let idx = failedAt + 1; idx < steps.length; idx += 1) {
      if (steps[idx].status === 'pending') steps[idx].status = 'skipped';
    }
    finish();
  }

  const itemAppearances = new Map<number, number>();
  const itemSlotTypes = new Map<number, string>();
  for (const [itemId, definition] of itemDefinitions) {
    itemAppearances.set(itemId, definition.appearanceId);
    const slotType = definition.properties?.slotType;
    if (typeof slotType === 'string' && slotType) itemSlotTypes.set(itemId, slotType);
  }

  if (!await runStep(0, async () => {
    const buf = compileObjectData(od, dirtyIds, itemAppearances, itemSlotTypes);
    reparsedObject = parseObjectData(buf);
    if (reparsedObject.formatVersion !== 3) {
      throw new Error(`Generated EOBJ v${reparsedObject.formatVersion}; expected v3.`);
    }
    if (reparsedObject.itemAppearances.size !== itemAppearances.size) {
      throw new Error('Generated EOBJ item mapping is incomplete.');
    }
    artifacts.push({ role: 'obj', name: sourceNames.obj || 'emperia.eobj', buf });
    return buf.byteLength;
  })) {
    abortGeneration(0);
    return;
  }

  if (!await runStep(1, async () => {
    const raw = compileSpriteData(sd, spriteOverrides);
    reparsedSprite = parseSpriteData(raw);
    if (reparsedSprite.spriteCount !== sd.spriteCount) {
      throw new Error(`Generated ESPR has ${reparsedSprite.spriteCount} sprites; expected ${sd.spriteCount}.`);
    }
    const buf = await gzipCompress(raw);
    artifacts.push({ role: 'spr', name: sourceNames.spr || 'emperia.espr', buf });
    return buf.byteLength;
  })) {
    abortGeneration(1);
    return;
  }

  if (!await runStep(2, async () => {
    const buf = encodeText(JSON.stringify({ version: buildAssetVersion() }, null, 2));
    validateJson(buf, 'version.json');
    artifacts.push({ role: 'generated', name: 'version.json', buf });
    return buf.byteLength;
  })) {
    abortGeneration(2);
    return;
  }

  if (!await runStep(3, async () => {
    const definitions: Record<string, unknown> = {};
    for (const itemId of Array.from(itemDefinitions.keys()).sort((a, b) => a - b)) {
      const definition = itemDefinitions.get(itemId)!;
      let properties: Record<string, unknown> | null = null;
      if (definition.properties) {
        properties = {};
        for (const [key, value] of Object.entries(definition.properties)) {
          if (value !== undefined && value !== null && value !== '' && !(key === 'article' && value === 'a')) {
            properties[key] = value;
          }
        }
        if (Object.keys(properties).length === 0) properties = null;
      }

      const thing = od.things.get(definition.appearanceId);
      if (thing?.category === 'item' && thing.flags.ground) {
        const speed = thing.flags.groundSpeed ?? 100;
        if (speed !== 100) {
          properties ??= {};
          properties.friction = speed;
        } else if (properties) {
          delete properties.friction;
          if (Object.keys(properties).length === 0) properties = null;
        }
      }

      if (thing?.category === 'item' && thing.flags.hasLight && (thing.flags.lightLevel ?? 0) > 0) {
        properties ??= {};
        properties.lightLevel = thing.flags.lightLevel ?? 0;
        properties.lightColor = thing.flags.lightColor ?? 0;
      } else if (properties) {
        delete properties.lightLevel;
        delete properties.lightColor;
        if (Object.keys(properties).length === 0) properties = null;
      }

      const entry: Record<string, unknown> = {};
      if (definition.flags !== 0) entry.flags = definition.flags;
      if (definition.group !== 0) entry.group = definition.group;
      if (definition.topOrder && definition.topOrder > 0) entry.topOrder = definition.topOrder;
      if (properties) entry.properties = properties;
      definitions[String(itemId)] = entry;
    }

    const buf = encodeText(JSON.stringify(definitions, null, 4));
    validateJson(buf, 'items.json');
    artifacts.push({ role: 'def', name: sourceNames.def || 'items.json', buf });
    return buf.byteLength;
  })) {
    abortGeneration(3);
    return;
  }

  if (state.spriteMapLoaded) {
    if (!await runStep(4, async () => {
      const buf = encodeText(state.exportSpriteMapJson());
      validateJson(buf, 'item-to-sprite.json');
      artifacts.push({ role: 'spriteMap', name: sourceNames.spriteMap || 'item-to-sprite.json', buf });
      return buf.byteLength;
    })) {
      abortGeneration(4);
      return;
    }
  } else {
    skipStep(4);
  }

  if (itemDefinitions.size > 0) {
    if (!await runStep(5, async () => {
      const buf = compileItemsOtb(itemDefinitions, od);
      const bytes = new Uint8Array(buf);
      if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 0 || bytes[3] !== 0) {
        throw new Error('Generated items.otb has an invalid header.');
      }
      artifacts.push({ role: 'generated', name: 'items.otb', buf });
      return buf.byteLength;
    })) {
      abortGeneration(5);
      return;
    }

    if (!await runStep(6, async () => {
      const buf = compileItemsXml(itemDefinitions, od);
      validateXml(buf);
      artifacts.push({ role: 'generated', name: 'items.xml', buf });
      return buf.byteLength;
    })) {
      abortGeneration(6);
      return;
    }
  } else {
    skipStep(5);
    skipStep(6);
  }

  if (state.hairDefsLoaded) {
    if (!await runStep(7, async () => {
      const buf = encodeText(state.exportHairDefinitionsJson());
      validateJson(buf, 'hair-definitions.json');
      artifacts.push({ role: 'hairDefs', name: sourceNames.hairDefs || 'hair-definitions.json', buf });
      return buf.byteLength;
    })) {
      abortGeneration(7);
      return;
    }
  } else {
    skipStep(7);
  }

  let primarySaved = false;
  const saveSucceeded = await runStep(8, async () => {
    if (sourceDir) {
      if (!await sourcePermission) {
        throw new Error(`Write permission was not granted for source folder "${sourceDir.name}".`);
      }
      await saveDirectoryBatch(sourceDir, artifacts, true);
      for (const artifact of artifacts) {
        outputs.push({ name: artifact.name, destination: sourceDir.name, size: artifact.buf.byteLength });
      }
    } else {
      const handleByRole: Partial<Record<ArtifactRole, FileSystemFileHandle | null>> = {
        obj: sourceHandles.obj,
        spr: sourceHandles.spr,
        def: sourceHandles.def,
        spriteMap: sourceHandles.spriteMap,
        hairDefs: sourceHandles.hairDefs,
      };
      for (const artifact of artifacts) {
        const handle = handleByRole[artifact.role];
        if (handle) {
          await writeAndVerify(handle, artifact.buf);
          outputs.push({ name: artifact.name, destination: 'original file', size: artifact.buf.byteLength });
        } else {
          downloadFile(artifact.buf, artifact.name);
          outputs.push({ name: artifact.name, destination: 'Downloads', size: artifact.buf.byteLength });
        }
      }
    }
    primarySaved = true;

    for (const outputDir of outputDirs) {
      const selected = outputDir.files?.length
        ? artifacts.filter((artifact) => outputDir.files!.includes(artifact.name))
        : artifacts;
      if (selected.length === 0) continue;
      const permission = outputPermissions.find((entry) => entry.dir === outputDir);
      if (!permission || !await permission.allowed) {
        throw new Error(`Write permission was not granted for output "${outputDir.label}". Remove and add this destination again.`);
      }
      try {
        await saveDirectoryBatch(outputDir.handle, selected, false);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Output "${outputDir.label}" failed: ${detail}`);
      }
      for (const artifact of selected) {
        outputs.push({ name: artifact.name, destination: outputDir.label, size: artifact.buf.byteLength });
      }
    }

    return outputs.reduce((total, output) => total + output.size, 0);
  });

  if (primarySaved) {
    // Use the validated compiled data as the next in-memory baseline. This makes
    // repeated compiles in one session deterministic and clears applied overrides.
    useOBStore.setState({
      objectData: reparsedObject!,
      spriteData: reparsedSprite!,
    });
    markClean();
  }

  if (!saveSucceeded && !primarySaved) {
    console.error('[OB] No compiled source files were replaced.');
  }
  finish();
}
