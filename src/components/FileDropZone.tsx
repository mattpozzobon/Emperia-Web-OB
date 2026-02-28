import { useCallback, useState, useRef, useEffect } from 'react';
import { Upload, FileWarning, Loader2, FolderOpen, RotateCcw } from 'lucide-react';
import { useOBStore } from '../store';
import {
  saveLastDirHandle,
  loadLastDirHandle,
  saveSessionHandles,
  loadSessionHandles,
  verifyPermission,
  type SessionHandles,
} from '../lib/dir-handle-store';

export function FileDropZone() {
  const loadFiles = useOBStore((s) => s.loadFiles);
  const loading = useOBStore((s) => s.loading);
  const error = useOBStore((s) => s.error);
  const [dragOver, setDragOver] = useState(false);
  const loadDefinitions = useOBStore((s) => s.loadDefinitions);
  const loadSpriteMap = useOBStore((s) => s.loadSpriteMap);
  const setSourceDir = useOBStore((s) => s.setSourceDir);
  const setSourceHandles = useOBStore((s) => s.setSourceHandles);
  const objRef = useRef<ArrayBuffer | null>(null);
  const sprRef = useRef<ArrayBuffer | null>(null);
  const [objName, setObjName] = useState<string | null>(null);
  const [sprName, setSprName] = useState<string | null>(null);
  const [defName, setDefName] = useState<string | null>(null);
  const [spriteMapName, setSpriteMapName] = useState<string | null>(null);

  const pendingJsonRef = useRef<ArrayBuffer | null>(null);
  const pendingSpriteMapRef = useRef<ArrayBuffer | null>(null);
  const lastDirRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Track collected file handles during folder load for persisting to IndexedDB
  const pendingHandlesRef = useRef<SessionHandles>({});

  // Whether a previous session exists in IndexedDB
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);

  // Check for saved session on mount
  useEffect(() => {
    loadLastDirHandle().then((h) => { if (h) lastDirRef.current = h; });
    loadSessionHandles().then((s) => {
      if (s && (s.obj || s.spr)) setHasSavedSession(true);
    });
  }, []);

  // Helper: persist session handles to IndexedDB after a successful load
  const persistSession = useCallback((handles: SessionHandles) => {
    saveSessionHandles(handles);
  }, []);

  const tryAutoLoad = useCallback(() => {
    if (!objRef.current || !sprRef.current) return;
    if (pendingJsonRef.current) {
      try {
        const text = new TextDecoder().decode(pendingJsonRef.current);
        const json = JSON.parse(text);
        loadDefinitions(json);
      } catch (err) {
        console.error('Failed to parse definitions JSON:', err);
      }
      pendingJsonRef.current = null;
    }
    if (pendingSpriteMapRef.current) {
      try {
        const text = new TextDecoder().decode(pendingSpriteMapRef.current);
        const json = JSON.parse(text);
        loadSpriteMap(json);
      } catch (err) {
        console.error('Failed to parse item-to-sprite JSON:', err);
      }
      pendingSpriteMapRef.current = null;
    }
    loadFiles(objRef.current, sprRef.current);

    // Persist whatever handles we collected so far
    if (pendingHandlesRef.current.obj || pendingHandlesRef.current.spr) {
      persistSession(pendingHandlesRef.current);
      // Also store them in Zustand for compile save-back
      setSourceHandles(pendingHandlesRef.current);
    }
  }, [loadFiles, loadDefinitions, loadSpriteMap, persistSession, setSourceHandles]);

  const handleFile = useCallback((file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const reader = new FileReader();
    reader.onload = (e) => {
      const buf = e.target?.result as ArrayBuffer;
      if (ext === 'dat' || ext === 'eobj') {
        objRef.current = buf;
        setObjName(file.name);
      } else if (ext === 'spr' || ext === 'espr') {
        sprRef.current = buf;
        setSprName(file.name);
      } else if (ext === 'json') {
        const lowerName = file.name.toLowerCase();
        if (lowerName.includes('item-to-sprite') || lowerName.includes('sprite-map') || lowerName.includes('spritemap')) {
          pendingSpriteMapRef.current = buf;
          setSpriteMapName(file.name);
        } else {
          pendingJsonRef.current = buf;
          setDefName(file.name);
        }
      }
      tryAutoLoad();
    };
    reader.readAsArrayBuffer(file);
  }, [tryAutoLoad]);

  // Open Folder — uses File System Access API for direct save-back
  const handleOpenFolder = useCallback(async () => {
    if (typeof (window as any).showDirectoryPicker !== 'function') return;
    try {
      const opts: any = { mode: 'readwrite' };
      if (lastDirRef.current) opts.startIn = lastDirRef.current;
      const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker(opts);
      const names: { obj?: string; spr?: string; def?: string; spriteMap?: string } = {};
      const handles: SessionHandles = { dir: dirHandle };

      // Scan for matching files in the selected folder
      for await (const [name, entry] of (dirHandle as any).entries()) {
        if (entry.kind !== 'file') continue;
        const ext = name.split('.').pop()?.toLowerCase();
        if ((ext === 'eobj' || ext === 'dat') && !names.obj) {
          names.obj = name;
          handles.obj = entry as FileSystemFileHandle;
          const file = await (entry as FileSystemFileHandle).getFile();
          objRef.current = await file.arrayBuffer();
          setObjName(name);
        } else if ((ext === 'espr' || ext === 'spr') && !names.spr) {
          names.spr = name;
          handles.spr = entry as FileSystemFileHandle;
          const file = await (entry as FileSystemFileHandle).getFile();
          sprRef.current = await file.arrayBuffer();
          setSprName(name);
        } else if (ext === 'json' && name.toLowerCase().includes('definition') && !names.def) {
          names.def = name;
          handles.def = entry as FileSystemFileHandle;
          const file = await (entry as FileSystemFileHandle).getFile();
          pendingJsonRef.current = await file.arrayBuffer();
          setDefName(name);
        } else if (ext === 'json' && (name.toLowerCase().includes('item-to-sprite') || name.toLowerCase().includes('sprite-map')) && !names.spriteMap) {
          names.spriteMap = name;
          handles.spriteMap = entry as FileSystemFileHandle;
          const file = await (entry as FileSystemFileHandle).getFile();
          pendingSpriteMapRef.current = await file.arrayBuffer();
          setSpriteMapName(name);
        }
      }

      pendingHandlesRef.current = handles;
      setSourceDir(dirHandle, names);
      lastDirRef.current = dirHandle;
      saveLastDirHandle(dirHandle);
      console.log('[OB] Opened folder:', dirHandle.name, names);
      tryAutoLoad();
    } catch { /* user cancelled */ }
  }, [tryAutoLoad, setSourceDir]);

  // Reload Last Session — re-read from persisted file handles
  const handleReloadSession = useCallback(async () => {
    setReloadError(null);
    const session = await loadSessionHandles();
    if (!session) { setReloadError('No saved session found.'); return; }

    // Request permission on each handle (browser will prompt once per session)
    const permFailed: string[] = [];

    async function readHandle(
      handle: FileSystemFileHandle | null | undefined,
      label: string,
    ): Promise<ArrayBuffer | null> {
      if (!handle) return null;
      try {
        if (!await verifyPermission(handle, 'readwrite')) {
          permFailed.push(label);
          return null;
        }
        const file = await handle.getFile();
        return file.arrayBuffer();
      } catch (e) {
        console.warn(`[OB] Failed to read ${label}:`, e);
        permFailed.push(label);
        return null;
      }
    }

    const objBuf = await readHandle(session.obj, 'Objects');
    const sprBuf = await readHandle(session.spr, 'Sprites');
    const defBuf = await readHandle(session.def, 'Definitions');
    const mapBuf = await readHandle(session.spriteMap, 'Sprite Map');

    if (permFailed.length > 0) {
      setReloadError(`Permission denied for: ${permFailed.join(', ')}. Click to retry.`);
      if (!objBuf || !sprBuf) return; // Can't proceed without the two required files
    }

    if (!objBuf || !sprBuf) {
      setReloadError('Required files (objects + sprites) not found in saved session.');
      return;
    }

    // Load definitions first so they're available when loadFiles runs
    if (defBuf) {
      try {
        const text = new TextDecoder().decode(defBuf);
        loadDefinitions(JSON.parse(text));
      } catch (e) { console.error('Failed to parse definitions:', e); }
    }
    if (mapBuf) {
      try {
        const text = new TextDecoder().decode(mapBuf);
        loadSpriteMap(JSON.parse(text));
      } catch (e) { console.error('Failed to parse sprite map:', e); }
    }

    // Set handles in store for save-back
    setSourceHandles({
      obj: session.obj,
      spr: session.spr,
      def: session.def,
      spriteMap: session.spriteMap,
    });
    if (session.dir) {
      const names: { obj?: string; spr?: string; def?: string; spriteMap?: string } = {};
      if (session.obj) names.obj = session.obj.name;
      if (session.spr) names.spr = session.spr.name;
      if (session.def) names.def = session.def.name;
      if (session.spriteMap) names.spriteMap = session.spriteMap.name;
      setSourceDir(session.dir, names);
    }

    setObjName(session.obj?.name ?? null);
    setSprName(session.spr?.name ?? null);
    setDefName(session.def?.name ?? null);
    setSpriteMapName(session.spriteMap?.name ?? null);

    loadFiles(objBuf, sprBuf);
  }, [loadFiles, loadDefinitions, loadSpriteMap, setSourceHandles, setSourceDir]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files).forEach(handleFile);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach((f) => handleFile(f));
  }, [handleFile]);

  return (
    <div className="h-full flex items-center justify-center bg-emperia-bg p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-emperia-text mb-2">
            Emperia Object Builder
          </h1>
          <p className="text-emperia-muted text-sm">v1.0.0 — Web Edition</p>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`
            border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
            transition-all duration-200
            ${dragOver
              ? 'border-emperia-accent bg-emperia-accent/10'
              : 'border-emperia-border hover:border-emperia-muted bg-emperia-surface'
            }
          `}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            multiple
            accept=".dat,.spr,.eobj,.espr,.json"
            className="hidden"
            onChange={handleFileInput}
          />

          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-12 h-12 text-emperia-accent animate-spin" />
              <p className="text-emperia-text">Loading files…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="w-12 h-12 text-emperia-muted" />
              <p className="text-emperia-text font-medium">
                Drop your files here
              </p>
              <p className="text-emperia-muted text-sm">
                Drag &amp; drop <code className="text-emperia-accent">.eobj</code> + <code className="text-emperia-accent">.espr</code> files
                <br />
                or legacy <code className="text-emperia-accent">.dat</code> + <code className="text-emperia-accent">.spr</code>
                <br />
                <span className="text-emperia-muted/60">+ optional <code className="text-emperia-accent">definitions.json</code> &amp; <code className="text-emperia-accent">item-to-sprite.json</code></span>
              </p>
            </div>
          )}
        </div>

        {/* Open Folder + Reload Last Session */}
        {typeof (window as any).showDirectoryPicker === 'function' && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 text-emperia-muted/40 text-xs w-full">
              <div className="flex-1 h-px bg-emperia-border/40" />
              <span>or</span>
              <div className="flex-1 h-px bg-emperia-border/40" />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emperia-accent/10 border border-emperia-accent/30 text-emperia-accent hover:bg-emperia-accent/20 transition-colors text-sm font-medium"
              >
                <FolderOpen className="w-4 h-4" />
                Open Folder
              </button>
              {hasSavedSession && (
                <button
                  onClick={handleReloadSession}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors text-sm font-medium"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reload Last Session
                </button>
              )}
            </div>
            <p className="text-emperia-muted/50 text-[10px] text-center">
              Auto-detects files &amp; saves directly back on compile
              {hasSavedSession && <span className="text-green-400/50"> · Previous session available</span>}
            </p>
            {reloadError && (
              <p className="text-red-400 text-[10px] text-center">{reloadError}</p>
            )}
          </div>
        )}

        {/* Status indicators */}
        <div className="mt-4 flex flex-wrap gap-4 justify-center text-xs">
          <div className={`flex items-center gap-1.5 ${objName ? 'text-green-400' : 'text-emperia-muted'}`}>
            <div className={`w-2 h-2 rounded-full ${objName ? 'bg-green-400' : 'bg-emperia-border'}`} />
            {objName || 'Objects (.eobj / .dat)'}
          </div>
          <div className={`flex items-center gap-1.5 ${sprName ? 'text-green-400' : 'text-emperia-muted'}`}>
            <div className={`w-2 h-2 rounded-full ${sprName ? 'bg-green-400' : 'bg-emperia-border'}`} />
            {sprName || 'Sprites (.espr / .spr)'}
          </div>
          <div className={`flex items-center gap-1.5 ${defName ? 'text-green-400' : 'text-emperia-muted/50'}`}>
            <div className={`w-2 h-2 rounded-full ${defName ? 'bg-green-400' : 'bg-emperia-border/50'}`} />
            {defName || 'Definitions (.json) — optional'}
          </div>
          <div className={`flex items-center gap-1.5 ${spriteMapName ? 'text-green-400' : 'text-emperia-muted/50'}`}>
            <div className={`w-2 h-2 rounded-full ${spriteMapName ? 'bg-green-400' : 'bg-emperia-border/50'}`} />
            {spriteMapName || 'Sprite Map (.json) — optional'}
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
            <FileWarning className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
