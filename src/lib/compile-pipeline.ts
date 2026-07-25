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
import type { EquipmentAppearance, HairDefinition } from './types';

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
  'Definitions (.json)',
  'Items OTB (.otb)',
  'Items XML (.xml)',
  'Asset Package Manifest',
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

/**
 * These fields belong to EOBJ/ESPR or are retired ID aliases. They must never
 * leak into the server gameplay projection (`items.json`).
 */
const SERVER_ITEM_EXCLUDED_PROPERTIES = new Set([
  'lightLevel',
  'lightColor',
  'appearanceId',
  'spriteId',
  'clientId',
  'serverId',
]);

type ArtifactRole = 'obj' | 'spr' | 'def' | 'generated';

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

interface StagedHandleFile {
  artifact: CompiledArtifact;
  handle: FileSystemFileHandle;
  previous: ArrayBuffer;
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

function encodeText(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer;
}

async function sha256(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function compilePackageManifest(artifacts: CompiledArtifact[]): Promise<ArrayBuffer> {
  const files: Record<string, { sha256: string; size: number }> = {};
  for (const artifact of [...artifacts].sort((a, b) => a.name.localeCompare(b.name))) {
    files[artifact.name] = {
      sha256: await sha256(artifact.buf),
      size: artifact.buf.byteLength,
    };
  }
  const identity = Object.entries(files)
    .map(([name, file]) => `${name}:${file.sha256}:${file.size}`)
    .join('\n');
  const packageId = await sha256(encodeText(identity));
  return encodeText(JSON.stringify({
    schemaVersion: 1,
    packageId,
    generatedAt: new Date().toISOString(),
    files,
  }, null, 2));
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
  const expected = new Uint8Array(buf);
  const reader = saved.stream().getReader();
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let index = 0; index < value.length; index++) {
        if (value[index] !== expected[offset + index]) {
          throw new Error(`Content verification failed for ${handle.name} at byte ${offset + index}.`);
        }
      }
      offset += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== expected.length) {
    throw new Error(`Content verification failed for ${handle.name}: expected ${expected.length} bytes, read ${offset}.`);
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
  const backupArtifacts: CompiledArtifact[] = files.map(({ artifact, previous }) => ({
    role: artifact.role,
    name: artifact.name,
    buf: previous!,
  }));
  await saveDirectoryBatch(backupDir, backupArtifacts, false);
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

async function saveHandleBatch(files: StagedHandleFile[]): Promise<void> {
  try {
    for (const { artifact, handle } of files) {
      try {
        await writeAndVerify(handle, artifact.buf);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not replace "${handle.name}": ${detail}`);
      }
    }
  } catch (error) {
    const restoreFailures: string[] = [];
    for (const { handle, previous } of files) {
      try {
        await writeAndVerify(handle, previous);
      } catch {
        restoreFailures.push(handle.name);
      }
    }
    if (restoreFailures.length > 0) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)} Rollback failed for: ${restoreFailures.join(', ')}.`,
      );
    }
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

  const itemAppearances = new Map<number, number>(od.itemAppearances);
  const itemSlotTypes = new Map<number, string>(od.itemSlotTypes);
  if (state.definitionsLoaded && itemDefinitions.size > 0) {
    itemAppearances.clear();
    itemSlotTypes.clear();
    for (const [itemId, definition] of itemDefinitions) {
      itemAppearances.set(itemId, definition.appearanceId);
      const slotType = definition.properties?.slotType;
      if (typeof slotType === 'string' && slotType) itemSlotTypes.set(itemId, slotType);
    }
  }
  if (itemAppearances.size === 0 && sourceHandles.obj) {
    try {
      const diskObject = parseObjectData(await (await sourceHandles.obj.getFile()).arrayBuffer());
      for (const [itemId, appearanceId] of diskObject.itemAppearances) {
        itemAppearances.set(itemId, appearanceId);
      }
      for (const [itemId, slotType] of diskObject.itemSlotTypes) {
        itemSlotTypes.set(itemId, slotType);
      }
    } catch (error) {
      console.error('[OB] Could not refresh EOBJ mappings from disk:', error);
    }
  }
  const equipmentAppearances = new Map<number, EquipmentAppearance>(od.equipmentAppearances);
  const hairDefinitions = new Map<number, HairDefinition>(od.hairDefinitions);

  if (!await runStep(0, async () => {
    if (sourceNames.def && (!state.definitionsLoaded || itemDefinitions.size === 0)) {
      throw new Error(
        `${sourceNames.def} was found in the asset package but was not loaded. `
        + 'Reopen the package before compiling.',
      );
    }
    if (itemAppearances.size === 0) {
      throw new Error('EOBJ has no public item mappings. Open a valid asset with items.json loaded.');
    }
    const buf = compileObjectData(
      od,
      dirtyIds,
      itemAppearances,
      itemSlotTypes,
      equipmentAppearances,
      hairDefinitions,
    );
    reparsedObject = parseObjectData(buf);
    if (reparsedObject.formatVersion !== 6) {
      throw new Error(`Generated EOBJ v${reparsedObject.formatVersion}; expected v6.`);
    }
    if (reparsedObject.itemAppearances.size !== itemAppearances.size) {
      throw new Error('Generated EOBJ item mapping is incomplete.');
    }
    if (reparsedObject.equipmentAppearances.size !== equipmentAppearances.size) {
      throw new Error('Generated EOBJ equipment catalog is incomplete.');
    }
    if (reparsedObject.hairDefinitions.size !== hairDefinitions.size) {
      throw new Error('Generated EOBJ hair catalog is incomplete.');
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

  if (state.definitionsLoaded && itemDefinitions.size > 0) {
    if (!await runStep(2, async () => {
    const definitions: Record<string, unknown> = {};
    for (const itemId of Array.from(itemDefinitions.keys()).sort((a, b) => a - b)) {
      const definition = itemDefinitions.get(itemId)!;
      let properties: Record<string, unknown> | null = null;
      if (definition.properties) {
        properties = {};
        for (const [key, value] of Object.entries(definition.properties)) {
          if (
            !SERVER_ITEM_EXCLUDED_PROPERTIES.has(key)
            && value !== undefined
            && value !== null
            && value !== ''
            && !(key === 'article' && value === 'a')
          ) {
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
      abortGeneration(2);
      return;
    }
  } else {
    skipStep(2);
  }

  if (state.definitionsLoaded && itemDefinitions.size > 0) {
    if (!await runStep(3, async () => {
      const buf = compileItemsOtb(itemDefinitions, od);
      const bytes = new Uint8Array(buf);
      if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0 || bytes[2] !== 0 || bytes[3] !== 0) {
        throw new Error('Generated items.otb has an invalid header.');
      }
      artifacts.push({ role: 'generated', name: 'items.otb', buf });
      return buf.byteLength;
    })) {
      abortGeneration(3);
      return;
    }

    if (!await runStep(4, async () => {
      const buf = compileItemsXml(itemDefinitions, od);
      validateXml(buf);
      artifacts.push({ role: 'generated', name: 'items.xml', buf });
      return buf.byteLength;
    })) {
      abortGeneration(4);
      return;
    }
  } else {
    skipStep(3);
    skipStep(4);
  }

  if (!await runStep(5, async () => {
    const buf = await compilePackageManifest(artifacts);
    validateJson(buf, 'asset-package.json');
    artifacts.push({ role: 'generated', name: 'asset-package.json', buf });
    return buf.byteLength;
  })) {
    abortGeneration(5);
    return;
  }

  let primarySaved = false;
  const saveSucceeded = await runStep(6, async () => {
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
      };
      const handleFiles: StagedHandleFile[] = [];
      const downloads: CompiledArtifact[] = [];
      for (const artifact of artifacts) {
        const handle = handleByRole[artifact.role];
        if (handle) {
          handleFiles.push({
            artifact,
            handle,
            previous: await (await handle.getFile()).arrayBuffer(),
          });
        } else {
          downloads.push(artifact);
        }
      }
      await saveHandleBatch(handleFiles);
      for (const { artifact } of handleFiles) {
        outputs.push({ name: artifact.name, destination: 'original file', size: artifact.buf.byteLength });
      }
      for (const artifact of downloads) {
        downloadFile(artifact.buf, artifact.name);
        outputs.push({ name: artifact.name, destination: 'Downloads', size: artifact.buf.byteLength });
      }
    }
    primarySaved = true;

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
