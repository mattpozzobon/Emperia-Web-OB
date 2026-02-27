import { Package, Shirt, Sparkles, ArrowRight, Search, Plus, Minus, Download } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import { exportSelectedSprites } from '../lib/export-sprites';
import type { ThingCategory } from '../lib/types';

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

const CATEGORIES: { key: ThingCategory; label: string; icon: typeof Package }[] = [
  { key: 'item', label: 'Items', icon: Package },
  { key: 'outfit', label: 'Outfits', icon: Shirt },
  { key: 'effect', label: 'Effects', icon: Sparkles },
  { key: 'distance', label: 'Distance', icon: ArrowRight },
];

export function CategoryTabs() {
  const activeCategory = useOBStore((s) => s.activeCategory);
  const setActiveCategory = useOBStore((s) => s.setActiveCategory);
  const objectData = useOBStore((s) => s.objectData);
  const searchQuery = useOBStore((s) => s.searchQuery);
  const setSearchQuery = useOBStore((s) => s.setSearchQuery);
  const selectedThingId = useOBStore((s) => s.selectedThingId);
  const addThing = useOBStore((s) => s.addThing);
  const removeThing = useOBStore((s) => s.removeThing);
  const getCategoryRange = useOBStore((s) => s.getCategoryRange);
  const filterGroup = useOBStore((s) => s.filterGroup);
  const setFilterGroup = useOBStore((s) => s.setFilterGroup);
  const definitionsLoaded = useOBStore((s) => s.definitionsLoaded);
  const selectedThingIds = useOBStore((s) => s.selectedThingIds);
  const spriteData = useOBStore((s) => s.spriteData);
  const spriteOverrides = useOBStore((s) => s.spriteOverrides);
  const itemDefinitions = useOBStore((s) => s.itemDefinitions);
  const clientToServerIds = useOBStore((s) => s.clientToServerIds);
  useOBStore((s) => s.editVersion);

  const selCount = selectedThingIds.size;
  const handleExport = async () => {
    if (!objectData || !spriteData) return;
    // Export multi-selected items, or fall back to single selected item
    const ids = selCount > 0
      ? Array.from(selectedThingIds)
      : selectedThingId != null ? [selectedThingId] : [];
    if (ids.length === 0) return;
    await exportSelectedSprites(ids, {
      objectData,
      spriteData,
      spriteOverrides,
      itemDefinitions,
      clientToServerIds,
    });
  };

  const getCategoryCount = (cat: ThingCategory) => {
    if (!objectData) return 0;
    switch (cat) {
      case 'item': return objectData.itemCount - 99;
      case 'outfit': return objectData.outfitCount;
      case 'effect': return objectData.effectCount;
      case 'distance': return objectData.distanceCount;
    }
  };

  return (
    <div className="shrink-0">
      <div className="flex border-b border-emperia-border">
        {CATEGORIES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`
              flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors
              ${activeCategory === key
                ? 'text-emperia-accent border-b-2 border-emperia-accent bg-emperia-accent/5'
                : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'
              }
            `}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            <span className="text-[10px] opacity-60">{getCategoryCount(key)}</span>
          </button>
        ))}
      </div>

      {/* Search bar + group filter + add/remove */}
      <div className="px-2 py-1.5 border-b border-emperia-border flex items-center gap-1">
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
        {definitionsLoaded && activeCategory === 'item' && (
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(parseInt(e.target.value, 10))}
            className="text-[10px] bg-emperia-surface border border-emperia-border rounded px-1 py-1 text-emperia-text outline-none cursor-pointer max-w-[80px]"
            title="Filter by group"
          >
            <option value={-1}>All</option>
            {Object.entries(GROUP_LABELS).map(([g, label]) => (
              <option key={g} value={g}>{label}</option>
            ))}
          </select>
        )}
        <button
          onClick={handleExport}
          disabled={!objectData || !spriteData || (selCount === 0 && selectedThingId == null)}
          className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-blue-400 hover:border-blue-400/50 disabled:opacity-30 transition-colors"
          title={selCount > 0 ? `Export ${selCount} selected sprites` : 'Export selected sprite'}
        >
          <Download className="w-3.5 h-3.5" />
        </button>
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
            const range = getCategoryRange(activeCategory);
            if (!range || selectedThingId !== range.end) return;
            const dId = objectData ? getDisplayId(objectData, selectedThingId) : selectedThingId;
            if (confirm(`Remove ${activeCategory} #${dId}? Only the last entry can be removed.`)) {
              removeThing(selectedThingId);
            }
          }}
          disabled={!objectData || !selectedThingId || (() => { const r = getCategoryRange(activeCategory); return !r || selectedThingId !== r.end; })()}
          className="p-1 rounded bg-emperia-surface border border-emperia-border text-emperia-muted hover:text-red-400 hover:border-red-400/50 disabled:opacity-30 transition-colors"
          title={`Remove last ${activeCategory}`}
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
