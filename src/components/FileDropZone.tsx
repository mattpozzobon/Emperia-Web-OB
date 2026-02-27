import { useCallback, useState, useRef } from 'react';
import { Upload, FileWarning, Loader2, FolderOpen } from 'lucide-react';
import { useOBStore } from '../store';

export function FileDropZone() {
  const loadFiles = useOBStore((s) => s.loadFiles);
  const loading = useOBStore((s) => s.loading);
  const error = useOBStore((s) => s.error);
  const [dragOver, setDragOver] = useState(false);
  const loadDefinitions = useOBStore((s) => s.loadDefinitions);
  const setSourceDir = useOBStore((s) => s.setSourceDir);
  const objRef = useRef<ArrayBuffer | null>(null);
  const sprRef = useRef<ArrayBuffer | null>(null);
  const [objName, setObjName] = useState<string | null>(null);
  const [sprName, setSprName] = useState<string | null>(null);
  const [defName, setDefName] = useState<string | null>(null);

  const pendingJsonRef = useRef<ArrayBuffer | null>(null);

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
    loadFiles(objRef.current, sprRef.current);
  }, [loadFiles, loadDefinitions]);

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
        pendingJsonRef.current = buf;
        setDefName(file.name);
      }
      tryAutoLoad();
    };
    reader.readAsArrayBuffer(file);
  }, [tryAutoLoad]);

  // Open Folder — uses File System Access API for direct save-back
  const handleOpenFolder = useCallback(async () => {
    if (typeof (window as any).showDirectoryPicker !== 'function') return;
    try {
      const dirHandle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      const names: { obj?: string; spr?: string; def?: string } = {};

      // Scan for matching files in the selected folder
      for await (const [name, entry] of (dirHandle as any).entries()) {
        if (entry.kind !== 'file') continue;
        const ext = name.split('.').pop()?.toLowerCase();
        if ((ext === 'eobj' || ext === 'dat') && !names.obj) {
          names.obj = name;
          const file = await (entry as FileSystemFileHandle).getFile();
          objRef.current = await file.arrayBuffer();
          setObjName(name);
        } else if ((ext === 'espr' || ext === 'spr') && !names.spr) {
          names.spr = name;
          const file = await (entry as FileSystemFileHandle).getFile();
          sprRef.current = await file.arrayBuffer();
          setSprName(name);
        } else if (ext === 'json' && name.toLowerCase().includes('definition') && !names.def) {
          names.def = name;
          const file = await (entry as FileSystemFileHandle).getFile();
          pendingJsonRef.current = await file.arrayBuffer();
          setDefName(name);
        }
      }

      setSourceDir(dirHandle, names);
      console.log('[OB] Opened folder:', dirHandle.name, names);
      tryAutoLoad();
    } catch { /* user cancelled */ }
  }, [tryAutoLoad, setSourceDir]);

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
                <span className="text-emperia-muted/60">+ optional <code className="text-emperia-accent">definitions.json</code></span>
              </p>
            </div>
          )}
        </div>

        {/* Open Folder button — single permission grant, auto-saves back on compile */}
        {typeof (window as any).showDirectoryPicker === 'function' && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 text-emperia-muted/40 text-xs w-full">
              <div className="flex-1 h-px bg-emperia-border/40" />
              <span>or</span>
              <div className="flex-1 h-px bg-emperia-border/40" />
            </div>
            <button
              onClick={handleOpenFolder}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emperia-accent/10 border border-emperia-accent/30 text-emperia-accent hover:bg-emperia-accent/20 transition-colors text-sm font-medium"
            >
              <FolderOpen className="w-4 h-4" />
              Open Folder
            </button>
            <p className="text-emperia-muted/50 text-[10px] text-center">
              Auto-detects files &amp; saves directly back on compile
            </p>
          </div>
        )}

        {/* Status indicators */}
        <div className="mt-4 flex gap-4 justify-center text-xs">
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
