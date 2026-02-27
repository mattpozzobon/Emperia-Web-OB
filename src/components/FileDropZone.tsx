import { useCallback, useState, useRef } from 'react';
import { Upload, FileWarning, Loader2 } from 'lucide-react';
import { useOBStore } from '../store';

export function FileDropZone() {
  const loadFiles = useOBStore((s) => s.loadFiles);
  const loading = useOBStore((s) => s.loading);
  const error = useOBStore((s) => s.error);
  const [dragOver, setDragOver] = useState(false);
  const objRef = useRef<ArrayBuffer | null>(null);
  const sprRef = useRef<ArrayBuffer | null>(null);
  const [objName, setObjName] = useState<string | null>(null);
  const [sprName, setSprName] = useState<string | null>(null);

  const tryLoad = useCallback(() => {
    if (objRef.current && sprRef.current) {
      loadFiles(objRef.current, sprRef.current);
    }
  }, [loadFiles]);

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
      }
      // Auto-load when both are ready
      if (objRef.current && sprRef.current) {
        loadFiles(objRef.current, sprRef.current);
      }
    };
    reader.readAsArrayBuffer(file);
  }, [loadFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    Array.from(e.dataTransfer.files).forEach(handleFile);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(handleFile);
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
            accept=".dat,.spr,.eobj,.espr"
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
              </p>
            </div>
          )}
        </div>

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
