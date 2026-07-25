import { useState } from 'react';
import { Search, Plus, Minus, Download, Trash2, Grid2X2 } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import { exportSelectedSprites, exportSelectedOBD, type BatchExportFormat } from '../lib/export-sprites';

const GROUP_LABELS: Record<number, string> = {
  0: 'None',
  1: 'Ground',
  2: 'Container',
  3: 'Weapon',
  4: 'Ammunition',
  5: 'Armor',
  6: 'Charges',
  7: 'Teleport',
  9: 'Write',
  10: 'Write Once',
  11: 'Fluid',
  12: 'Splash',
};

export function CategoryTabs() {
  const [exportFormat, setExportFormat] = useState<BatchExportFormat>('png');
  const activeCategory = useOBStore((s) => s.activeCategory);
  const activeLibrary = useOBStore((s) => s.activeLibrary);
  const objectData = useOBStore((s) => s.objectData);
  const searchQuery = useOBStore((s) => s.searchQuery);
  const setSearchQuery = useOBStore((s) => s.setSearchQuery);
  const selectedThingId = useOBStore((s) => s.selectedThingId);
  const addThing = useOBStore((s) => s.addThing);
  const removeThing = useOBStore((s) => s.removeThing);
  const clearThing = useOBStore((s) => s.clearThing);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const filterGroup = useOBStore((s) => s.filterGroup);
  const setFilterGroup = useOBStore((s) => s.setFilterGroup);
  const libraryColumns = useOBStore((s) => s.libraryColumns);
  const setLibraryColumns = useOBStore((s) => s.setLibraryColumns);
  const definitionsLoaded = useOBStore((s) => s.definitionsLoaded);
  const selectedThingIds = useOBStore((s) => s.selectedThingIds);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const appearanceToItemIds = useOBStore((s) => s.appearanceToItemIds);
  useOBStore((s) => s.editVersion);

  const selCount = selectedThingIds.size;
  const handleExport = async () => {
    if (!objectData || !spriteData) return;
    // Export multi-selected items, or fall back to single selected item
    const ids = selCount > 0
      ? Array.from(selectedThingIds)
      : selectedThingId != null ? [selectedThingId] : [];
    if (ids.length === 0) return;
    const exportCtx = {
      objectData,
      spriteData,
      spriteOverrides,
      itemDefinitions,
      appearanceToItemIds,
    };
    if (exportFormat === 'obd') {
      await exportSelectedOBD(ids, exportCtx);
      return;
    }
    await exportSelectedSprites(ids, exportCtx);
  };

  return (
    <div className="shrink-0">
      {/* Row 1: Search */}
      <div className="px-2 py-1.5 border-b border-emperia-border flex items-center gap-1">
        {definitionsLoaded && activeLibrary === 'item' && (
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(parseInt(e.target.value, 10))}
            className="text-[10px] bg-emperia-surface border border-emperia-border rounded px-1 py-1 text-emperia-text outline-none cursor-pointer max-w-[80px] shrink-0"
            title="Filter by group"
          >
            <option value={-1}>All</option>
            {Object.entries(GROUP_LABELS).map(([g, label]) => (
              <option key={g} value={g}>{label}</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-1.5 bg-emperia-surface rounded px-2 py-1 flex-1">
          <Search className="w-3.5 h-3.5 text-emperia-muted shrink-0" />
          <input
            type="text"
            placeholder={definitionsLoaded ? 'Search by ID or name…' : 'Search by ID…'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-emperia-text placeholder-emperia-muted/50 outline-none w-full"
          />
          {selCount > 0 && (
            <span className="text-[10px] text-emperia-accent font-medium shrink-0">{selCount} sel</span>
          )}
        </div>
      </div>
      {/* Row 2: Actions */}
      <div className="px-2 py-1 border-b border-emperia-border flex items-center gap-1">
        <label
          className="flex items-center gap-1 rounded border border-emperia-border bg-emperia-surface px-1 text-emperia-muted"
          title="Number of columns in the object library"
        >
          <Grid2X2 className="h-3.5 w-3.5 shrink-0" />
          <select
            value={libraryColumns}
            onChange={(e) => setLibraryColumns(Number(e.target.value))}
            className="cursor-pointer bg-emperia-surface py-1 text-[10px] text-emperia-text outline-none"
            style={{ colorScheme: 'dark' }}
            aria-label="Library columns"
          >
            {[2, 3, 4, 5, 6].map((columns) => (
              <option
                key={columns}
                value={columns}
                className="bg-emperia-surface text-emperia-text"
              >
                {columns}
              </option>
            ))}
          </select>
        </label>
        <select
          value={exportFormat}
          onChange={(e) => setExportFormat(e.target.value as BatchExportFormat)}
          className="text-[10px] bg-emperia-surface border border-emperia-border rounded px-1 py-1 text-emperia-text outline-none cursor-pointer max-w-[70px]"
          title="Choose export format"
        >
          <option value="png">PNG</option>
          <option value="obd">OBD</option>
        </select>
        <button
          onClick={handleExport}
          disabled={!objectData || !spriteData || (selCount === 0 && selectedThingId == null)}
          className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-blue-400 hover:border-blue-400/50 disabled:opacity-30 transition-colors"
          title={selCount > 0 ? `Export ${selCount} selected ${exportFormat.toUpperCase()} files` : `Export selected ${exportFormat.toUpperCase()}`}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        {(
          <>
            <button
              onClick={() => addThing(activeCategory)}
              disabled={!objectData}
              className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-green-400 hover:border-green-400/50 disabled:opacity-30 transition-colors"
              title={`Add new ${activeCategory}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (!selectedThingId || !objectData) return;
                const dId = getDisplayId(objectData, selectedThingId);
                if (confirm(`Clear ${activeCategory} #${dId}? This will strip all sprites and properties but keep the slot.`)) {
                  clearThing(selectedThingId);
                }
              }}
              disabled={!objectData || !selectedThingId}
              className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-red-400 hover:border-red-400/50 disabled:opacity-30 transition-colors"
              title={`Clear selected ${activeCategory} (keep slot)`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (!selectedThingId || !objectData) return;
                const range = getCategoryRange(activeCategory);
                if (!range || selectedThingId !== range.end) return;
                const dId = objectData ? getDisplayId(objectData, selectedThingId) : selectedThingId;
                if (confirm(`Remove ${activeCategory} #${dId}? Only the last entry can be removed.`)) {
                  removeThing(selectedThingId);
                }
              }}
              disabled={!objectData || !selectedThingId || (() => { const r = getCategoryRange(activeCategory); return !r || selectedThingId !== r.end; })()}
              className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-orange-400 hover:border-orange-400/50 disabled:opacity-30 transition-colors"
              title={`Remove last ${activeCategory}`}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
