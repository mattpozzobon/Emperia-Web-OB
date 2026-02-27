import { Package, Shirt, Sparkles, ArrowRight, Search, Plus, Minus } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import type { ThingCategory } from '../lib/types';

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
  useOBStore((s) => s.editVersion);

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

      {/* Search bar + add/remove */}
      <div className="px-2 py-1.5 border-b border-emperia-border flex items-center gap-1">
        <div className="flex items-center gap-1.5 bg-emperia-surface rounded px-2 py-1 flex-1">
          <Search className="w-3.5 h-3.5 text-emperia-muted shrink-0" />
          <input
            type="text"
            placeholder="Search by ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-xs text-emperia-text placeholder-emperia-muted/50 outline-none w-full"
          />
        </div>
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
