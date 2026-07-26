import { useCallback, useState, useRef, useEffect } from 'react';
import { FileWarning, Loader2, FolderOpen, RotateCcw } from 'lucide-react';
import { useOBStore } from '../store';
import {
  saveLastDirHandle,
  loadLastDirHandle,
  saveSessionHandles,
  loadSessionHandles,
  verifyPermission,
  type SessionHandles,
} from '../lib/dir-handle-store';
import { ITEM_LOCALES, type ItemCatalogFile, type ItemLocale } from '../lib/types';
import { ITEM_CATALOG_FILE, parseItemCatalog } from '../lib/item-localization';

export function FileDropZone() {
  const loadFiles = useOBStore((s) => s.loadFiles);
  const loading = useOBStore((s) => s.loading);
  const error = useOBStore((s) => s.error);
  const loadDefinitions = useOBStore((s) => s.loadDefinitions);
  const loadItemCatalogs = useOBStore((s) => s.loadItemCatalogs);
  const setSourceDir = useOBStore((s) => s.setSourceDir);
  const setSourceHandles = useOBStore((s) => s.setSourceHandles);
  const objRef = useRef<ArrayBuffer | null>(null);
  const sprRef = useRef<ArrayBuffer | null>(null);

  const pendingJsonRef = useRef<ArrayBuffer | null>(null);
  const pendingCatalogsRef = useRef<Partial<Record<ItemLocale, ItemCatalogFile>>>({});
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

  const tryAutoLoad = useCallback(async () => {
    if (!objRef.current || !sprRef.current) return;
    let definitions: unknown = null;
    if (pendingJsonRef.current) {
      try {
        const text = new TextDecoder().decode(pendingJsonRef.current);
        definitions = JSON.parse(text);
      } catch (err) {
        console.error('Failed to parse definitions JSON:', err);
      }
      pendingJsonRef.current = null;
    }
    await loadFiles(objRef.current, sprRef.current);
    if (definitions) loadDefinitions(definitions as Record<string, any>);
    loadItemCatalogs(pendingCatalogsRef.current);
    pendingCatalogsRef.current = {};

    // Persist whatever handles we collected so far
    if (pendingHandlesRef.current.obj || pendingHandlesRef.current.spr) {
      persistSession(pendingHandlesRef.current);
      // Also store them in Zustand for compile save-back
      setSourceHandles(pendingHandlesRef.current);
    }
  }, [loadFiles, loadDefinitions, loadItemCatalogs, persistSession, setSourceHandles]);

  // Open Folder — uses File System Access API for direct save-back
  const handleOpenFolder = useCallback(async () => {
    if (typeof (window as any).showDirectoryPicker !== 'function') return;
    try {
      const opts: any = { mode: 'readwrite' };
      if (lastDirRef.current) opts.startIn = lastDirRef.current;
      const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker(opts);
      if (dirHandle.name.toLowerCase() === 'backup') {
        setReloadError('Select the asset folder, not its backup subfolder.');
        return;
      }
      objRef.current = null;
      sprRef.current = null;
      pendingJsonRef.current = null;
      pendingCatalogsRef.current = {};
      const names: { obj?: string; spr?: string; def?: string } = {};
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
        } else if ((ext === 'espr' || ext === 'spr') && !names.spr) {
          names.spr = name;
          handles.spr = entry as FileSystemFileHandle;
          const file = await (entry as FileSystemFileHandle).getFile();
          sprRef.current = await file.arrayBuffer();
        } else if (ext === 'json' && (name.toLowerCase() === 'items.json' || name.toLowerCase().includes('definition')) && !name.toLowerCase().includes('hair') && !names.def) {
          names.def = name;
          handles.def = entry as FileSystemFileHandle;
          const file = await (entry as FileSystemFileHandle).getFile();
          pendingJsonRef.current = await file.arrayBuffer();
        } else if (ext === 'json') {
          const match = name.toLowerCase().match(/^item-catalog\.(en|pt|es|pl)\.json$/);
          if (match) {
            const locale = match[1] as ItemLocale;
            const file = await (entry as FileSystemFileHandle).getFile();
            pendingCatalogsRef.current[locale] = parseItemCatalog(
              JSON.parse(await file.text()),
              locale,
            );
          }
        }
      }

      pendingHandlesRef.current = handles;
      setSourceDir(dirHandle, names);
      lastDirRef.current = dirHandle;
      saveLastDirHandle(dirHandle);

      await tryAutoLoad();
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
        console.error(`[OB] Failed to read ${label}:`, e);
        permFailed.push(label);
        return null;
      }
    }

    const objBuf = await readHandle(session.obj, 'Objects');
    const sprBuf = await readHandle(session.spr, 'Sprites');
    const defBuf = await readHandle(session.def, 'Definitions');

    if (permFailed.length > 0) {
      setReloadError(`Permission denied for: ${permFailed.join(', ')}. Click to retry.`);
      if (!objBuf || !sprBuf) return; // Can't proceed without the two required files
    }

    if (!objBuf || !sprBuf) {
      setReloadError('Required files (objects + sprites) not found in saved session.');
      return;
    }

    // EOBJ owns the public ID -> appearance mapping, so it must be loaded
    // before public item definitions can be associated with appearances.
    await loadFiles(objBuf, sprBuf);
    if (defBuf) {
      try {
        const text = new TextDecoder().decode(defBuf);
        loadDefinitions(JSON.parse(text));
      } catch (e) { console.error('Failed to parse definitions:', e); }
    }
    if (session.dir && await verifyPermission(session.dir, 'read')) {
      const catalogs: Partial<Record<ItemLocale, ItemCatalogFile>> = {};
      for (const locale of ITEM_LOCALES) {
        try {
          const handle = await session.dir.getFileHandle(ITEM_CATALOG_FILE(locale));
          const file = await handle.getFile();
          catalogs[locale] = parseItemCatalog(JSON.parse(await file.text()), locale);
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
            console.error(`[OB] Failed to load ${ITEM_CATALOG_FILE(locale)}:`, error);
          }
        }
      }
      loadItemCatalogs(catalogs);
    } else {
      loadItemCatalogs({});
    }
    // Set handles in store for save-back
    setSourceHandles({
      obj: session.obj,
      spr: session.spr,
      def: session.def,
    });
    if (session.dir) {
      const names: { obj?: string; spr?: string; def?: string } = {};
      if (session.obj) names.obj = session.obj.name;
      if (session.spr) names.spr = session.spr.name;
      if (session.def) names.def = session.def.name;
      setSourceDir(session.dir, names);
    }

  }, [loadFiles, loadDefinitions, loadItemCatalogs, setSourceHandles, setSourceDir]);

  return (
    <div className="h-full flex items-center justify-center bg-emperia-bg p-8">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <img
            src="/emperia-icon-purple.svg"
            alt="Emperia"
            className="w-24 h-24 mx-auto mb-4"
          />
          <h1 className="text-3xl font-bold text-emperia-text mb-2">
            Emperia Object Builder
          </h1>
          <p className="text-emperia-muted text-sm">v1.0.0 — Web Edition</p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="w-12 h-12 text-emperia-accent animate-spin" />
            <p className="text-emperia-text">Loading files…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={handleOpenFolder}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emperia-accent/10 border border-emperia-accent/30 text-emperia-accent hover:bg-emperia-accent/20 transition-colors text-sm font-medium"
              >
                <FolderOpen className="w-4 h-4" />
                Open Asset Package
              </button>
              {hasSavedSession && (
                <button
                  onClick={handleReloadSession}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors text-sm font-medium"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reload Last Session
                </button>
              )}
            </div>
            <p className="text-emperia-muted/50 text-[10px] text-center">
              Opens one canonical package and saves every compiled artifact together
            </p>
            {reloadError && (
              <p className="text-red-400 text-[10px] text-center">{reloadError}</p>
            )}
          </div>
        )}

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
