import { ArrowRight, Package, Scissors, Shirt, Sparkles, Swords } from 'lucide-react';
import { useOBStore } from '../store';
import type { LibraryCategory } from '../lib/types';

const CATEGORIES: { key: LibraryCategory; label: string; icon: typeof Package }[] = [
  { key: 'item', label: 'Items', icon: Package },
  { key: 'outfit', label: 'Outfits', icon: Shirt },
  { key: 'effect', label: 'Effects', icon: Sparkles },
  { key: 'distance', label: 'Distance', icon: ArrowRight },
  { key: 'equipment', label: 'Equipment', icon: Swords },
  { key: 'hair', label: 'Hair', icon: Scissors },
];

export function LibraryTabs() {
  const objectData = useOBStore((state) => state.objectData);
  const activeLibrary = useOBStore((state) => state.activeLibrary);
  const setActiveLibrary = useOBStore((state) => state.setActiveLibrary);

  if (!objectData) return null;

  const getCategoryCount = (category: LibraryCategory): number => {
    switch (category) {
      case 'item': return objectData.itemCount - 99;
      case 'outfit': return objectData.outfitCount;
      case 'effect': return objectData.effectCount;
      case 'distance': return objectData.distanceCount;
      case 'equipment': return objectData.equipmentCount;
      case 'hair': return objectData.hairCount;
    }
  };

  return (
    <nav
      className="absolute left-1/2 top-0 flex h-full -translate-x-1/2 items-stretch"
      aria-label="Object library"
    >
      {CATEGORIES.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          onClick={() => setActiveLibrary(key)}
          className={`flex items-center gap-1.5 border-b-2 px-2.5 text-[11px] transition-colors ${
            activeLibrary === key
              ? 'border-emperia-accent bg-emperia-accent/10 text-emperia-accent'
              : 'border-transparent text-emperia-muted hover:bg-emperia-hover hover:text-emperia-text'
          }`}
          title={`${label}: ${getCategoryCount(key)} objects`}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span>{label}</span>
          <span className="text-[9px] opacity-55">{getCategoryCount(key)}</span>
        </button>
      ))}
    </nav>
  );
}
