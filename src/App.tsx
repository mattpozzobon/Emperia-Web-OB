import { useOBStore, getDisplayId } from './store';
import { FileDropZone } from './components/FileDropZone';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ThingGrid } from './components/ThingGrid';
import { SpritePreview } from './components/SpritePreview';
import { PropertyInspector } from './components/PropertyInspector';
import { ThingSpriteGrid } from './components/ThingSpriteGrid';
import { ObjectSlots } from './components/ObjectSlots';
import { ServerPropertiesEditor } from './components/ServerPropertiesEditor';
import { EquipmentSpriteMap } from './components/EquipmentSpriteMap';

type CenterTab = 'texture' | 'properties' | 'attributes' | 'server' | 'equipment';

const TAB_LABELS: Record<CenterTab, string> = {
  texture: 'Texture',
  properties: 'Properties',
  attributes: 'Attributes',
  server: 'Server',
  equipment: 'Equipment',
} as const;

function SelectedItemBadge() {
  const selectedId = useOBStore((s) => s.selectedThingId);
  const objectData = useOBStore((s) => s.objectData);
  const clientToServerIds = useOBStore((s) => s.clientToServerIds);
  useOBStore((s) => s.editVersion);

  const thing = selectedId != null ? objectData?.things.get(selectedId) ?? null : null;
  if (!thing || !objectData) return null;

  const clientId = getDisplayId(objectData, thing.id);
  const serverId = clientToServerIds.get(thing.id);

  return (
    <div className="flex items-center gap-3 text-[11px] font-mono">
      <span className="flex items-center gap-1.5">
        <span className="text-emperia-muted">Client</span>
        <span className="text-cyan-400 font-semibold">{clientId}</span>
      </span>
      {serverId != null && (
        <span className="flex items-center gap-1.5">
          <span className="text-emperia-muted">Server</span>
          <span className="text-amber-400 font-semibold">{serverId}</span>
        </span>
      )}
      <span className="text-emperia-muted/60 capitalize text-[10px]">{thing.category}</span>
    </div>
  );
}

export default function App() {
  const loaded = useOBStore((s) => s.loaded);
  const centerTab = useOBStore((s) => s.centerTab);
  const setCenterTab = useOBStore((s) => s.setCenterTab);

  if (!loaded) {
    return <FileDropZone />;
  }

  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Category tabs + item grid */}
        <div className="w-64 flex flex-col border-r border-emperia-border bg-emperia-bg">
          <CategoryTabs />
          <ThingGrid />
        </div>

        {/* Center: Texture / Properties / Attributes */}
        <div className="flex-1 flex flex-col bg-emperia-bg overflow-hidden">
          <div className="flex items-center border-b border-emperia-border shrink-0">
            {(['texture', 'properties', 'attributes', 'server', 'equipment'] as CenterTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setCenterTab(tab)}
                className={`px-4 py-2 text-xs font-medium transition-colors
                  ${centerTab === tab
                    ? 'text-emperia-accent border-b-2 border-emperia-accent'
                    : 'text-emperia-muted hover:text-emperia-text'
                  }
                `}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
            <div className="flex-1" />
            <div className="pr-3">
              <SelectedItemBadge />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {centerTab === 'texture' && <SpritePreview />}
            {centerTab === 'properties' && <PropertyInspector />}
            {centerTab === 'attributes' && <PropertyInspector showAttributesOnly />}
            {centerTab === 'server' && <ServerPropertiesEditor />}
            {centerTab === 'equipment' && <EquipmentSpriteMap />}
          </div>
        </div>

        {/* Middle-right: Object sprite slots */}
        <div className="w-[260px] border-l border-emperia-border bg-emperia-bg overflow-hidden flex flex-col">
          <ObjectSlots />
        </div>

        {/* Right: Sprite atlas browser */}
        <div className="w-72 border-l border-emperia-border bg-emperia-bg overflow-hidden flex flex-col">
          <ThingSpriteGrid />
        </div>
      </div>
    </div>
  );
}
