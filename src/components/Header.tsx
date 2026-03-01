import { useEffect, useState, useRef, useCallback } from 'react';
import { FolderOpen, Info, Undo2, Redo2, Download, Circle, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { useOBStore } from '../store';
import { compileObjectData } from '../lib/object-writer';
import { compileSpriteData } from '../lib/sprite-writer';
import { gzipCompress } from '../lib/emperia-format';
import { compileItemsOtb } from '../lib/otb-writer';

interface CompileStep {
  label: string;
  status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
  elapsed?: number;  // ms
  error?: string;
  size?: number;     // output bytes
}

interface CompileState {
  active: boolean;
  steps: CompileStep[];
  currentStep: number;
  startTime: number;
  endTime?: number;
  totalElapsed: number;
}

const STEP_LABELS = [
  'Objects (.eobj)',
  'Sprites (.espr)',
  'Definitions (.json)',
  'Sprite Map (.json)',
  'Items OTB (.otb)',
  'Hair Definitions',
  'Asset Manifest',
] as const;

const INITIAL_COMPILE_STATE: CompileState = {
  active: false,
  steps: STEP_LABELS.map((label) => ({ label, status: 'pending' as const })),
  currentStep: -1,
  startTime: 0,
  totalElapsed: 0,
};

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Header() {
  const objectData = useOBStore((s) => s.objectData);
  const spriteData = useOBStore((s) => s.spriteData);
  const reset = useOBStore((s) => s.reset);
  const dirty = useOBStore((s) => s.dirty);
  const undo = useOBStore((s) => s.undo);
  const redo = useOBStore((s) => s.redo);
  const undoStack = useOBStore((s) => s.undoStack);
  const redoStack = useOBStore((s) => s.redoStack);
  const markClean = useOBStore((s) => s.markClean);

  const dirtyIds = useOBStore((s) => s.dirtyIds);
  const [compile, setCompile] = useState<CompileState>(INITIAL_COMPILE_STATE);
  const timerRef = useRef<number | null>(null);

  // Tick the elapsed timer while compiling
  useEffect(() => {
    if (compile.active && !compile.endTime) {
      timerRef.current = window.setInterval(() => {
        setCompile((prev) => ({ ...prev, totalElapsed: performance.now() - prev.startTime }));
      }, 100);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [compile.active, compile.endTime]);

  // Auto-dismiss the status bar after success
  useEffect(() => {
    if (compile.endTime && compile.steps.every((s) => s.status === 'done' || s.status === 'skipped')) {
      const id = window.setTimeout(() => setCompile(INITIAL_COMPILE_STATE), 4000);
      return () => clearTimeout(id);
    }
  }, [compile.endTime, compile.steps]);

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleCompile = useCallback(async () => {
    // Prevent double-compile
    if (compile.active) return;

    // Read all state fresh from the store to avoid stale closures
    const {
      objectData: od, spriteData: sd, dirtyIds: currentDirtyIds,
      spriteOverrides, itemDefinitions, sourceDir, sourceNames, sourceHandles,
    } = useOBStore.getState();
    if (!od || !sd) return;

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
          console.warn(`[OB] Failed to write via file handle (${fileHandle.name}), trying folder fallback:`, err);
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
          console.warn(`[OB] Failed to write ${dirFileName} to folder, falling back to download:`, err);
        }
      }
      downloadFile(buf, fallbackName);
    }

    console.log(`[OB] Compiling: ${currentDirtyIds.size} dirty thing(s), ${spriteOverrides.size} sprite override(s)`);

    // Step 0: Compile .eobj
    await runStep(0, async () => {
      const allIds = new Set<number>();
      for (let id = 100; id <= od.itemCount + od.outfitCount + od.effectCount + od.distanceCount; id++) {
        allIds.add(id);
      }
      const objBuf = compileObjectData(od, allIds);
      await saveFile(objBuf, sourceHandles.obj, sourceNames.obj, 'emperia.eobj');
      od.originalBuffer = objBuf;
      return objBuf.byteLength;
    });

    // Step 1: Compile .espr
    await runStep(1, async () => {
      const sprBufRaw = compileSpriteData(sd, spriteOverrides);
      const sprBuf = await gzipCompress(sprBufRaw);
      await saveFile(sprBuf, sourceHandles.spr, sourceNames.spr, 'emperia.espr');
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
        entry.properties = cleanProps;
        defsObj[String(serverId)] = entry;
      }

      const defsJson = JSON.stringify(defsObj, null, 4);
      const buf = new TextEncoder().encode(defsJson).buffer;
      await saveFile(buf, sourceHandles.def, sourceNames.def, 'definitions.json');
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
          return buf.byteLength;
        });
      } else {
        skipStep(3);
      }
    }

    // Step 4: Compile items.otb
    if (itemDefinitions.size > 0) {
      await runStep(4, async () => {
        const otbBuf = compileItemsOtb(itemDefinitions);
        await saveFile(otbBuf, null, 'items.otb', 'items.otb');
        return otbBuf.byteLength;
      });
    } else {
      skipStep(4);
    }

    // Step 5: Compile hair-definitions.json
    {
      const { hairDefsLoaded, exportHairDefinitionsJson } = useOBStore.getState();
      if (hairDefsLoaded) {
        await runStep(5, async () => {
          const hairJson = exportHairDefinitionsJson();
          const buf = new TextEncoder().encode(hairJson).buffer;
          await saveFile(buf, null, 'hair-definitions.json', 'hair-definitions.json');
          return buf.byteLength;
        });
      } else {
        skipStep(5);
      }
    }

    // Step 6: Write emperia.easset manifest
    await runStep(6, async () => {
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
      return buf.byteLength;
    });

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

    if (sourceDir) {
      console.log('[OB] Saved to source folder:', sourceDir.name);
    }
    console.log(`[OB] Compile ${hasErrors ? 'finished with errors' : 'complete'} in ${formatMs(endTime - startTime)}`);
  }, [compile.active, markClean]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleCompile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // Compile status
  const compileActive = compile.active || !!compile.endTime;
  const errorCount = compile.steps.filter((s) => s.status === 'error').length;
  const doneCount = compile.steps.filter((s) => s.status === 'done').length;
  const totalSteps = compile.steps.filter((s) => s.status !== 'skipped').length;

  return (
    <>
      <div className="h-10 flex items-center px-3 gap-2 bg-emperia-surface border-b border-emperia-border shrink-0">
        <span className="text-sm font-bold text-emperia-text tracking-wide">
          Emperia Object Builder
        </span>
        <span className="text-xs text-emperia-muted">v1.0.0</span>

        {dirty && !compile.active && (
          <span title="Unsaved changes">
            <Circle className="w-2 h-2 fill-amber-400 text-amber-400" />
          </span>
        )}

        <div className="flex-1" />

        {/* Compile status inline */}
        {compileActive && (
          <div className="flex items-center gap-2 text-xs mr-2">
            {compile.active ? (
              <Loader2 className="w-3.5 h-3.5 text-emperia-accent animate-spin" />
            ) : errorCount > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className={compile.active ? 'text-emperia-accent' : errorCount > 0 ? 'text-amber-400' : 'text-emerald-400'}>
              {compile.active
                ? `Compiling ${doneCount}/${totalSteps}...`
                : errorCount > 0
                  ? `Done with ${errorCount} error${errorCount > 1 ? 's' : ''}`
                  : 'Compiled'}
            </span>
            <span className="text-emperia-muted">
              {formatMs(compile.totalElapsed)}
            </span>
          </div>
        )}

        {objectData && (
          <>
            <div className="flex items-center gap-3 text-xs text-emperia-muted mr-2">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3" />
                v{objectData.version}
              </span>
              <span>{objectData.things.size} objects</span>
            </div>

            {/* Undo/Redo */}
            <button
              onClick={undo}
              disabled={undoStack.length === 0 || compile.active}
              className="p-1.5 rounded text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover
                         disabled:opacity-30 disabled:cursor-default transition-colors"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0 || compile.active}
              className="p-1.5 rounded text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover
                         disabled:opacity-30 disabled:cursor-default transition-colors"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-5 bg-emperia-border mx-1" />

            {/* Compile */}
            <button
              onClick={handleCompile}
              disabled={compile.active}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium
                         bg-emperia-accent/20 text-emperia-accent hover:bg-emperia-accent/30
                         disabled:opacity-50 disabled:cursor-default transition-colors"
              title="Compile and save all files (Ctrl+S)"
            >
              {compile.active
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              {compile.active ? 'Compiling...' : 'Compile'}
            </button>
          </>
        )}

        <button
          onClick={reset}
          disabled={compile.active}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs
                     text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover
                     disabled:opacity-50 disabled:cursor-default transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Open
        </button>
      </div>

      {/* Compile progress detail bar */}
      {compileActive && (
        <div className="flex items-center gap-1 px-3 py-1 bg-emperia-bg border-b border-emperia-border text-[11px] overflow-x-auto">
          {compile.steps.map((step, i) => {
            if (step.status === 'skipped') return null;
            return (
              <div
                key={i}
                className={`flex items-center gap-1 px-2 py-0.5 rounded whitespace-nowrap ${
                  step.status === 'running' ? 'bg-emperia-accent/10 text-emperia-accent' :
                  step.status === 'done' ? 'text-emerald-400/80' :
                  step.status === 'error' ? 'bg-red-500/10 text-red-400' :
                  'text-emperia-muted/50'
                }`}
                title={step.error || undefined}
              >
                {step.status === 'running' && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
                {step.status === 'done' && <Check className="w-3 h-3 shrink-0" />}
                {step.status === 'error' && <X className="w-3 h-3 shrink-0" />}
                {step.status === 'pending' && <Circle className="w-2 h-2 shrink-0 opacity-30" />}
                <span>{step.label}</span>
                {step.elapsed != null && (
                  <span className="opacity-60">{formatMs(step.elapsed)}</span>
                )}
                {step.size != null && (
                  <span className="opacity-40">{formatBytes(step.size)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

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
