import { FolderOpen, Info } from 'lucide-react';
import { useOBStore } from '../store';

export function Header() {
  const objectData = useOBStore((s) => s.objectData);
  const reset = useOBStore((s) => s.reset);

  return (
    <div className="h-10 flex items-center px-3 gap-3 bg-emperia-surface border-b border-emperia-border shrink-0">
      <span className="text-sm font-bold text-emperia-text tracking-wide">
        Emperia Object Builder
      </span>
      <span className="text-xs text-emperia-muted">v1.0.0</span>

      <div className="flex-1" />

      {objectData && (
        <div className="flex items-center gap-3 text-xs text-emperia-muted">
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" />
            v{objectData.version}
          </span>
          <span>{objectData.things.size} objects</span>
        </div>
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
