import { useEffect } from 'react';
import { FolderOpen, Info, Undo2, Redo2, Download, Circle } from 'lucide-react';
import { useOBStore } from '../store';
import { compileObjectData } from '../lib/object-writer';
import { compileSpriteData } from '../lib/sprite-writer';

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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const dirtyIds = useOBStore((s) => s.dirtyIds);

  const handleCompile = () => {
    if (!objectData || !spriteData) return;

    // Compile .eobj (pass dirtyIds so unedited things use raw bytes)
    const objBuf = compileObjectData(objectData, dirtyIds);
    downloadFile(objBuf, 'emperia.eobj');

    // Compile .espr (pass through unchanged)
    const sprBuf = compileSpriteData(spriteData);
    downloadFile(sprBuf, 'emperia.espr');

    markClean();
  };

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
