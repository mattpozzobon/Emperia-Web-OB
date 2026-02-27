import { useOBStore } from './store';
import { FileDropZone } from './components/FileDropZone';
import { Header } from './components/Header';
import { CategoryTabs } from './components/CategoryTabs';
import { ThingGrid } from './components/ThingGrid';
import { SpritePreview } from './components/SpritePreview';
import { PropertyInspector } from './components/PropertyInspector';

export default function App() {
  const loaded = useOBStore((s) => s.loaded);

  if (!loaded) {
    return <FileDropZone />;
  }

  return (
    <div className="h-full flex flex-col">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Category tabs + item grid */}
        <div className="w-80 flex flex-col border-r border-emperia-border bg-emperia-bg">
          <CategoryTabs />
          <ThingGrid />
        </div>

        {/* Center: Sprite preview */}
        <div className="flex-1 flex items-center justify-center bg-emperia-bg">
          <SpritePreview />
        </div>

        {/* Right: Property inspector */}
        <div className="w-80 border-l border-emperia-border bg-emperia-bg overflow-y-auto">
          <PropertyInspector />
        </div>
      </div>
    </div>
  );
}
