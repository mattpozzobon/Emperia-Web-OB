import { useEffect, useState, useRef, useCallback } from 'react';
import { FolderOpen, Info, Undo2, Redo2, Download, Circle, Loader2, Check, X, AlertTriangle } from 'lucide-react';
import { useOBStore } from '../store';
import { INITIAL_COMPILE_STATE, formatMs, formatBytes, runCompile } from '../lib/compile-pipeline';
import type { CompileState } from '../lib/compile-pipeline';

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
    if (compile.active) return;
    await runCompile(setCompile, markClean);
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

