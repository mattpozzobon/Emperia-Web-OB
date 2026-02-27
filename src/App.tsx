import { useState } from 'react';
import { useOBStore } from './store';
import { FileDropZone } from './components/FileDropZone';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ThingGrid } from './components/ThingGrid';
import { SpritePreview } from './components/SpritePreview';
import { PropertyInspector } from './components/PropertyInspector';
import { ThingSpriteGrid } from './components/ThingSpriteGrid';

type CenterTab = 'texture' | 'properties' | 'attributes';

const TAB_LABELS: Record<CenterTab, string> = {
  texture: 'Texture',
  properties: 'Properties',
  attributes: 'Attributes',
};

export default function App() {
  const loaded = useOBStore((s) => s.loaded);
  const [centerTab, setCenterTab] = useState<CenterTab>('texture');

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
          <div className="flex border-b border-emperia-border shrink-0">
            {(['texture', 'properties', 'attributes'] as CenterTab[]).map((tab) => (
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
          </div>
          <div className="flex-1 overflow-y-auto">
            {centerTab === 'texture' && <SpritePreview />}
            {centerTab === 'properties' && <PropertyInspector />}
            {centerTab === 'attributes' && <PropertyInspector showAttributesOnly />}
          </div>
        </div>

        {/* Right: Sprite slots + sprite atlas browser */}
        <div className="w-72 border-l border-emperia-border bg-emperia-bg overflow-hidden flex flex-col">
          <ThingSpriteGrid />
        </div>
      </div>
    </div>
  );
}
