/**
 * Compile pipeline — orchestrates saving all asset files.
 * Extracted from Header.tsx to keep the component focused on UI.
 */
import { useOBStore } from '../store';
import { compileObjectData } from './object-writer';
import { compileSpriteData } from './sprite-writer';
import { gzipCompress } from './emperia-format';
import { compileItemsOtb } from './otb-writer';
import { compileItemsXml } from './items-xml-writer';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompileStep {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  elapsed?: number;  // ms
  error?: string;
  size?: number;     // output bytes
}

export interface CompileState {
  active: boolean;
  steps: CompileStep[];
  currentStep: number;
  startTime: number;
  endTime?: number;
  totalElapsed: number;
}

export const STEP_LABELS = [
  'Objects (.eobj)',
  'Sprites (.espr)',
  'Definitions (.json)',
  'Sprite Map (.json)',
  'Items OTB (.otb)',
  'Items XML (.xml)',
  'Hair Definitions',
  'Asset Manifest',
  'Copy to Output Dirs',
] as const;

export const INITIAL_COMPILE_STATE: CompileState = {
  active: false,
  steps: STEP_LABELS.map((label) => ({ label, status: 'pending' as const })),
  currentStep: -1,
  startTime: 0,
  totalElapsed: 0,
};

// ─── Formatting helpers ───────────────────────────────────────────────────────

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Download queue ───────────────────────────────────────────────────────────

// Queue of pending downloads — browsers block multiple rapid programmatic downloads.
// We stagger them by 150ms so each gets through.
const downloadQueue: { buffer: ArrayBuffer; filename: string }[] = [];
let downloadTimer: number | null = null;

function flushDownloadQueue() {
  if (downloadQueue.length === 0) {
    downloadTimer = null;
    return;
  }
  const { buffer, filename } = downloadQueue.shift()!;
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  downloadTimer = window.setTimeout(flushDownloadQueue, 150);
}

function downloadFile(buffer: ArrayBuffer, filename: string) {
  downloadQueue.push({ buffer, filename });
  if (downloadTimer == null) {
    flushDownloadQueue();
  }
}

// ─── Main compile function ────────────────────────────────────────────────────

export async function runCompile(
  setCompile: React.Dispatch<React.SetStateAction<CompileState>>,
  markClean: () => void,
): Promise<void> {
  // Read all state fresh from the store to avoid stale closures
  const {
    objectData: od, spriteData: sd, dirtyIds: currentDirtyIds,
    spriteOverrides, itemDefinitions, sourceDir, sourceNames, sourceHandles,
    outputDirs,
  } = useOBStore.getState();
  if (!od || !sd) return;

  // Collect compiled buffers for output-dir copying
  const compiledFiles: { name: string; buf: ArrayBuffer }[] = [];

  const startTime = performance.now();
  const steps: CompileStep[] = STEP_LABELS.map((label) => ({ label, status: 'pending' as const }));
  setCompile({ active: true, steps: [...steps], currentStep: 0, startTime, totalElapsed: 0 });

  // Helper: update a step's state
  function updateStep(idx: number, patch: Partial<CompileStep>) {
    Object.assign(steps[idx], patch);
    setCompile((prev) => ({
      ...prev,
      steps: [...steps],
      currentStep: idx,
      totalElapsed: performance.now() - startTime,
    }));
  }

  // Helper: run a step with timing and error isolation
  async function runStep(idx: number, fn: () => Promise<number | void>): Promise<boolean> {
    updateStep(idx, { status: 'running' });
    // Yield to let React paint the "running" state
    await new Promise((r) => setTimeout(r, 0));
    const t0 = performance.now();
    try {
      const size = await fn();
      updateStep(idx, {
        status: 'done',
        elapsed: performance.now() - t0,
        size: typeof size === 'number' ? size : undefined,
      });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[OB] Step "${steps[idx].label}" failed:`, err);
      updateStep(idx, { status: 'error', elapsed: performance.now() - t0, error: msg });
      return false;
    }
  }

  function skipStep(idx: number) {
    updateStep(idx, { status: 'skipped' });
  }

  // Helper: write to a per-file handle, then sourceDir, then download
  async function saveFile(
    buf: ArrayBuffer,
    fileHandle: FileSystemFileHandle | null | undefined,
    dirFileName: string | undefined,
    fallbackName: string,
  ) {
    if (fileHandle) {
      try {
        const writable = await fileHandle.createWritable();
        await writable.write(buf);
        await writable.close();
        return;
      } catch (err) {
        console.error(`[OB] Failed to write via file handle (${fileHandle.name}), trying folder fallback:`, err);
      }
    }
    if (sourceDir && dirFileName) {
      try {
        const fh = await sourceDir.getFileHandle(dirFileName, { create: true });
        const writable = await fh.createWritable();
        await writable.write(buf);
        await writable.close();
        return;
      } catch (err) {
        console.error(`[OB] Failed to write ${dirFileName} to folder, falling back to download:`, err);
      }
    }
    downloadFile(buf, fallbackName);
  }

  // Step 0: Compile .eobj
  await runStep(0, async () => {
    const allIds = new Set<number>();
    for (let id = 100; id <= od.itemCount + od.outfitCount + od.effectCount + od.distanceCount; id++) {
      allIds.add(id);
    }
    const objBuf = compileObjectData(od, allIds);
    await saveFile(objBuf, sourceHandles.obj, sourceNames.obj, 'emperia.eobj');
    compiledFiles.push({ name: sourceNames.obj || 'emperia.eobj', buf: objBuf });
    od.originalBuffer = objBuf;
    return objBuf.byteLength;
  });

  // Step 1: Compile .espr
  await runStep(1, async () => {
    const sprBufRaw = compileSpriteData(sd, spriteOverrides);
    const sprBuf = await gzipCompress(sprBufRaw);
    await saveFile(sprBuf, sourceHandles.spr, sourceNames.spr, 'emperia.espr');
    compiledFiles.push({ name: sourceNames.spr || 'emperia.espr', buf: sprBuf });
    sd.originalBuffer = sprBufRaw;
    return sprBuf.byteLength;
  });

  // Step 2: Compile definitions.json
  await runStep(2, async () => {
    const sortedServerIds = Array.from(itemDefinitions.keys()).sort((a, b) => a - b);
    const defsObj: Record<string, unknown> = {};

    for (const serverId of sortedServerIds) {
      const def = itemDefinitions.get(serverId)!;
      let cleanProps: Record<string, unknown> | null = null;
      if (def.properties) {
        cleanProps = {};
        for (const [k, v] of Object.entries(def.properties)) {
          if (v !== undefined && v !== null && v !== '') {
            cleanProps[k] = v;
          }
        }
        if (Object.keys(cleanProps).length === 0) cleanProps = null;
      }

      const clientId = def.id ?? serverId;
      const thing = od.things.get(clientId);
      if (thing?.category === 'item' && thing.flags.ground) {
        const speed = thing.flags.groundSpeed ?? 100;
        if (speed !== 100) {
          cleanProps = cleanProps ?? {};
          cleanProps.friction = speed;
        } else if (cleanProps) {
          delete cleanProps.friction;
          if (Object.keys(cleanProps).length === 0) cleanProps = null;
        }
      }

      const entry: Record<string, unknown> = {};
      if (def.id != null) entry.id = def.id;
      entry.flags = def.flags;
      entry.group = def.group;
      if (def.topOrder && def.topOrder > 0) entry.topOrder = def.topOrder;
      entry.properties = cleanProps;
      defsObj[String(serverId)] = entry;
    }

    const defsJson = JSON.stringify(defsObj, null, 4);
    const buf = new TextEncoder().encode(defsJson).buffer;
    await saveFile(buf, sourceHandles.def, sourceNames.def, 'definitions.json');
    compiledFiles.push({ name: sourceNames.def || 'definitions.json', buf });
    return buf.byteLength;
  });

  // Step 3: Compile item-to-sprite.json
  {
    const { spriteMapLoaded, exportSpriteMapJson } = useOBStore.getState();
    if (spriteMapLoaded) {
      await runStep(3, async () => {
        const spriteMapJson = exportSpriteMapJson();
        const buf = new TextEncoder().encode(spriteMapJson).buffer;
        await saveFile(buf, sourceHandles.spriteMap, sourceNames.spriteMap, 'item-to-sprite.json');
        compiledFiles.push({ name: sourceNames.spriteMap || 'item-to-sprite.json', buf });
        return buf.byteLength;
      });
    } else {
      skipStep(3);
    }
  }

  // Step 4: Compile items.otb
  if (itemDefinitions.size > 0) {
    await runStep(4, async () => {
      const otbBuf = compileItemsOtb(itemDefinitions, od);
      await saveFile(otbBuf, null, 'items.otb', 'items.otb');
      compiledFiles.push({ name: 'items.otb', buf: otbBuf });
      return otbBuf.byteLength;
    });
  } else {
    skipStep(4);
  }

  // Step 5: Compile items.xml
  if (itemDefinitions.size > 0) {
    await runStep(5, async () => {
      const xmlBuf = compileItemsXml(itemDefinitions, od);
      await saveFile(xmlBuf, null, 'items.xml', 'items.xml');
      compiledFiles.push({ name: 'items.xml', buf: xmlBuf });
      return xmlBuf.byteLength;
    });
  } else {
    skipStep(5);
  }

  // Step 6: Compile hair-definitions.json
  {
    const { hairDefsLoaded, exportHairDefinitionsJson } = useOBStore.getState();
    if (hairDefsLoaded) {
      await runStep(6, async () => {
        const hairJson = exportHairDefinitionsJson();
        const buf = new TextEncoder().encode(hairJson).buffer;
        await saveFile(buf, null, 'hair-definitions.json', 'hair-definitions.json');
        compiledFiles.push({ name: 'hair-definitions.json', buf });
        return buf.byteLength;
      });
    } else {
      skipStep(6);
    }
  }

  // Step 7: Write emperia.easset manifest
  await runStep(7, async () => {
    const easset = JSON.stringify({
      version: 1,
      features: {
        spriteDataSize: 4096,
        transparency: true,
        spriteSize: 32,
        frameDurations: true,
        extended: true,
        frameGroups: true,
      },
      contentVersion: od.version,
      format: 'emperia-asset-manifest',
      files: {
        sprites: 'emperia.espr',
        objects: 'emperia.eobj',
      },
    }, null, 2);
    const buf = new TextEncoder().encode(easset).buffer;
    await saveFile(buf, null, 'emperia.easset', 'emperia.easset');
    compiledFiles.push({ name: 'emperia.easset', buf });
    return buf.byteLength;
  });

  // Step 8: Copy compiled files to extra output directories (filtered per dir)
  if (outputDirs.length > 0 && compiledFiles.length > 0) {
    await runStep(8, async () => {
      let totalBytes = 0;
      for (const dir of outputDirs) {
        const filter = dir.files && dir.files.length > 0 ? dir.files : null;
        for (const { name, buf } of compiledFiles) {
          if (filter && !filter.includes(name)) continue;
          try {
            const fh = await dir.handle.getFileHandle(name, { create: true });
            const writable = await fh.createWritable();
            await writable.write(buf);
            await writable.close();
            totalBytes += buf.byteLength;
          } catch (err) {
            console.error(`[OB] Failed to copy ${name} to "${dir.label}":`, err);
          }
        }
      }
      return totalBytes;
    });
  } else {
    skipStep(8);
  }

  // Finalize
  const endTime = performance.now();
  const hasErrors = steps.some((s) => s.status === 'error');
  if (!hasErrors) markClean();

  setCompile((prev) => ({
    ...prev,
    active: false,
    endTime,
    totalElapsed: endTime - startTime,
  }));

}
