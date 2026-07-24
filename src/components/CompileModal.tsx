import { AlertTriangle, Check, Circle, Loader2, X } from 'lucide-react';
import { formatBytes, formatMs } from '../lib/compile-pipeline';
import type { CompileState } from '../lib/compile-pipeline';

interface CompileModalProps {
  compile: CompileState;
  open: boolean;
  onClose: () => void;
}

export function CompileModal({ compile, open, onClose }: CompileModalProps) {
  if (!open) return null;

  const errors = compile.steps.filter((step) => step.status === 'error');
  const completed = compile.steps.filter((step) => step.status === 'done').length;
  const applicable = compile.steps.filter((step) => step.status !== 'skipped').length;
  const progress = applicable > 0 ? Math.round((completed / applicable) * 100) : 0;
  const finished = !compile.active && !!compile.endTime;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compile-modal-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-emperia-border bg-emperia-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-emperia-border px-5 py-4">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            compile.active
              ? 'bg-emperia-accent/15 text-emperia-accent'
              : errors.length > 0
                ? 'bg-red-500/15 text-red-400'
                : 'bg-emerald-500/15 text-emerald-400'
          }`}>
            {compile.active
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : errors.length > 0
                ? <AlertTriangle className="h-5 w-5" />
                : <Check className="h-5 w-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <h2 id="compile-modal-title" className="text-sm font-semibold text-emperia-text">
              {compile.active
                ? 'Compiling and saving assets'
                : errors.length > 0
                  ? 'Compilation finished with errors'
                  : 'Compilation completed'}
            </h2>
            <p className="mt-0.5 text-xs text-emperia-muted">
              {compile.active
                ? `Processing step ${Math.min(completed + 1, applicable)} of ${applicable}`
                : `${completed} steps completed in ${formatMs(compile.totalElapsed)}`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={compile.active}
            className="rounded p-1.5 text-emperia-muted transition-colors hover:bg-emperia-hover hover:text-emperia-text disabled:cursor-not-allowed disabled:opacity-30"
            title={compile.active ? 'Wait for compilation to finish' : 'Close'}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="h-1 bg-emperia-bg">
          <div
            className={`h-full transition-all duration-300 ${
              errors.length > 0 ? 'bg-red-500' : 'bg-emperia-accent'
            }`}
            style={{ width: `${finished && errors.length === 0 ? 100 : progress}%` }}
          />
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {errors.map((step, index) => (
            <div
              key={`${step.label}-${index}`}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3"
            >
              <div className="flex items-start gap-2 text-xs text-red-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">{step.label}</div>
                  <div className="mt-1 break-words text-red-200/80">
                    {step.error || 'Unknown compilation error.'}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emperia-muted">
              Progress
            </h3>
            <div className="overflow-hidden rounded-lg border border-emperia-border">
              {compile.steps.map((step, index) => (
                <div
                  key={step.label}
                  className={`flex items-center gap-3 px-3 py-2 text-xs ${
                    index > 0 ? 'border-t border-emperia-border/70' : ''
                  }`}
                >
                  <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {step.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-emperia-accent" />}
                    {step.status === 'done' && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                    {step.status === 'error' && <X className="h-3.5 w-3.5 text-red-400" />}
                    {step.status === 'pending' && <Circle className="h-2.5 w-2.5 text-emperia-muted/40" />}
                    {step.status === 'skipped' && <span className="h-px w-2.5 bg-emperia-muted/30" />}
                  </div>
                  <span className={`min-w-0 flex-1 ${
                    step.status === 'running' ? 'text-emperia-accent' :
                    step.status === 'done' ? 'text-emperia-text' :
                    step.status === 'error' ? 'text-red-300' :
                    'text-emperia-muted/60'
                  }`}>
                    {step.label}
                  </span>
                  <span className="text-[10px] text-emperia-muted">
                    {step.status === 'pending' ? 'Waiting' :
                    step.status === 'running' ? 'Processing…' :
                    step.status === 'skipped' ? 'Skipped' :
                    step.status === 'error' ? 'Failed' :
                    'Completed'}
                  </span>
                  {step.elapsed != null && (
                    <span className="w-12 text-right text-[10px] text-emperia-muted">
                      {formatMs(step.elapsed)}
                    </span>
                  )}
                  {step.size != null && (
                    <span className="w-16 text-right text-[10px] text-emperia-muted">
                      {formatBytes(step.size)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>

          {compile.outputs.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-emperia-muted">
                Saved files
              </h3>
              <div className="overflow-hidden rounded-lg border border-emperia-border">
                {compile.outputs.map((output, index) => (
                  <div
                    key={`${output.destination}-${output.name}-${index}`}
                    className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-xs ${
                      index > 0 ? 'border-t border-emperia-border/70' : ''
                    }`}
                  >
                    <span className="truncate text-emperia-text" title={output.name}>
                      {output.name}
                    </span>
                    <span className="truncate text-sky-300/80" title={output.destination}>
                      → {output.destination}
                    </span>
                    <span className="text-[10px] text-emperia-muted">
                      {formatBytes(output.size)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-emperia-border px-5 py-3">
          <span className="text-xs text-emperia-muted">
            Elapsed: {formatMs(compile.totalElapsed)}
          </span>
          <button
            type="button"
            onClick={onClose}
            disabled={compile.active}
            className="rounded-md bg-emperia-accent px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {compile.active ? 'Compiling…' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
