import { useEffect } from 'react';
import { FolderOpen, Info, Undo2, Redo2, Download, Circle } from 'lucide-react';
import { useOBStore } from '../store';
import { compileObjectData } from '../lib/object-writer';
import { compileSpriteData } from '../lib/sprite-writer';
import { gzipCompress } from '../lib/emperia-format';

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

  // Warn before closing with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) { e.preventDefault(); }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const handleCompile = async () => {
    if (!objectData || !spriteData) return;

    const { spriteOverrides, itemDefinitions, sourceDir, sourceNames, sourceHandles } = useOBStore.getState();

    // Helper: write to a per-file handle, then sourceDir, then download
    async function saveFile(
      buf: ArrayBuffer,
      fileHandle: FileSystemFileHandle | null | undefined,
      dirFileName: string | undefined,
      fallbackName: string,
    ) {
      // 1. Try per-file handle (works even if file is in a different folder)
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
      // 2. Try sourceDir + filename
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
      // 3. Download
      downloadFile(buf, fallbackName);
    }

    // Compile .eobj
    const objBuf = compileObjectData(objectData, dirtyIds);
    await saveFile(objBuf, sourceHandles.obj, sourceNames.obj, 'emperia.eobj');

    // Compile .espr (gzip-compressed for ~74% size reduction)
    const sprBufRaw = compileSpriteData(spriteData, spriteOverrides);
    const sprBuf = await gzipCompress(sprBufRaw);
    await saveFile(sprBuf, sourceHandles.spr, sourceNames.spr, 'emperia.espr');

    // Compile definitions.json
    {
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

        // Sync friction from .eobj groundSpeed for ground items
        const clientId = def.id ?? serverId;
        const thing = objectData.things.get(clientId);
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
      await saveFile(new TextEncoder().encode(defsJson).buffer, sourceHandles.def, sourceNames.def, 'definitions.json');
    }

    // Compile item-to-sprite.json (if loaded)
    {
      const { spriteMapLoaded, exportSpriteMapJson } = useOBStore.getState();
      if (spriteMapLoaded) {
        const spriteMapJson = exportSpriteMapJson();
        await saveFile(new TextEncoder().encode(spriteMapJson).buffer, sourceHandles.spriteMap, sourceNames.spriteMap, 'item-to-sprite.json');
      }
    }

    // Write emperia.easset manifest
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
      contentVersion: objectData.version,
      format: 'emperia-asset-manifest',
      files: {
        sprites: 'emperia.espr',
        objects: 'emperia.eobj',
      },
    }, null, 2);
    downloadFile(new TextEncoder().encode(easset).buffer, 'emperia.easset');

    markClean();

    if (sourceDir) {
      console.log('[OB] Saved to source folder:', sourceDir.name);
    }
  };

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

  return (
    <div className="h-10 flex items-center px-3 gap-2 bg-emperia-surface border-b border-emperia-border shrink-0">
      <span className="text-sm font-bold text-emperia-text tracking-wide">
        Emperia Object Builder
      </span>
      <span className="text-xs text-emperia-muted">v1.0.0</span>

      {dirty && (
        <span title="Unsaved changes">
          <Circle className="w-2 h-2 fill-amber-400 text-amber-400" />
        </span>
      )}

      <div className="flex-1" />

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
            disabled={undoStack.length === 0}
            className="p-1.5 rounded text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover
                       disabled:opacity-30 disabled:cursor-default transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium
                       bg-emperia-accent/20 text-emperia-accent hover:bg-emperia-accent/30
                       transition-colors"
            title="Compile and download .eobj + .espr"
          >
            <Download className="w-3.5 h-3.5" />
            Compile
          </button>
        </>
      )}

      <button
        onClick={reset}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs
                   text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover
                   transition-colors"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        Open
      </button>
    </div>
  );
}

function downloadFile(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
