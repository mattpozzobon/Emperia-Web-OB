import { useCallback, useState, useRef, useEffect } from 'react';
import { FolderPlus, Trash2, FolderOutput, ChevronDown } from 'lucide-react';
import { useOBStore } from '../store';
import { saveOutputDirs } from '../lib/dir-handle-store';
import type { OutputDir } from '../store/store-types';

/** Predefined output directory presets with file filters. */
const PRESETS = [
  {
    id: 'client-assets',
    label: 'Client Assets',
    description: 'emperia.eobj, .espr, .easset',
    files: ['emperia.eobj', 'emperia.espr', 'emperia.easset'],
  },
  {
    id: 'server-items',
    label: 'Server Items',
    description: 'items.json → data/1098/items/',
    files: ['items.json'],
  },
  {
    id: 'server-hair',
    label: 'Server Hair',
    description: 'hair-definitions.json → data/1098/outfits/',
    files: ['hair-definitions.json'],
  },
  {
    id: 'server-equipment',
    label: 'Server Equipment',
    description: 'item-to-sprite.json → config/',
    files: ['item-to-sprite.json'],
  },
  {
    id: 'map-editor',
    label: 'Map Editor',
    description: 'items.otb + items.xml',
    files: ['items.otb', 'items.xml'],
  },
  {
    id: 'custom',
    label: 'Custom (all files)',
    description: 'Copies every compiled file',
    files: undefined as string[] | undefined,
  },
] as const;

function persistDirs() {
  const dirs = useOBStore.getState().outputDirs;
  saveOutputDirs(dirs.map((d) => ({ label: d.label, handle: d.handle, files: d.files })));
}

export function OutputDirsPanel() {
  const outputDirs = useOBStore((s) => s.outputDirs);
  const addOutputDir = useOBStore((s) => s.addOutputDir);
  const removeOutputDir = useOBStore((s) => s.removeOutputDir);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handlePreset = useCallback(async (preset: typeof PRESETS[number]) => {
    if (typeof (window as any).showDirectoryPicker !== 'function') return;
    setMenuOpen(false);
    try {
      const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      const label = `${preset.label} (${handle.name})`;
      addOutputDir(label, handle, preset.files ? [...preset.files] : undefined);
      // Wait for store update then persist
      setTimeout(persistDirs, 0);
    } catch { /* user cancelled */ }
  }, [addOutputDir]);

  const handleRemove = useCallback((index: number) => {
    removeOutputDir(index);
    setTimeout(persistDirs, 0);
  }, [removeOutputDir]);

  return (
    <div className="flex items-center gap-1.5">
      {outputDirs.map((dir: OutputDir, i: number) => {
        const fileCount = dir.files?.length;
        const tooltip = dir.files && dir.files.length > 0
          ? `${dir.label}\nFiles: ${dir.files.join(', ')}`
          : `${dir.label}\nAll compiled files`;
        return (
          <div
            key={i}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emperia-surface border border-emperia-border text-[10px] text-emperia-muted group"
            title={tooltip}
          >
            <FolderOutput className="w-3 h-3 text-emperia-accent/60" />
            <span className="max-w-[100px] truncate">{dir.label}</span>
            {fileCount != null && (
              <span className="text-emperia-accent/40">{fileCount}f</span>
            )}
            <button
              onClick={() => handleRemove(i)}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-0"
              title="Remove output directory"
            >
              <Trash2 className="w-2.5 h-2.5" />
            </button>
          </div>
        );
      })}

      {/* Add button with preset dropdown */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                     text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover transition-colors"
          title="Add output directory"
        >
          <FolderPlus className="w-3 h-3" />
          {outputDirs.length === 0 && <span>Output Dirs</span>}
          <ChevronDown className="w-2.5 h-2.5" />
        </button>

        {menuOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 rounded-lg bg-emperia-surface border border-emperia-border shadow-lg z-50 py-1">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handlePreset(preset)}
                className="w-full text-left px-3 py-1.5 hover:bg-emperia-hover transition-colors"
              >
                <div className="text-[11px] text-emperia-text font-medium">{preset.label}</div>
                <div className="text-[9px] text-emperia-muted leading-tight">{preset.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
