/**
 * Vertical layer scrubber for SpritePreview.
 */

interface LayerScrubberProps {
  layers: number;
  activeLayer: number;
  setActiveLayer: (l: number) => void;
  blendLayers: boolean;
  setBlendLayers: (b: boolean) => void;
  height: number;
}

export function LayerScrubber({ layers, activeLayer, setActiveLayer, blendLayers, setBlendLayers, height }: LayerScrubberProps) {
  return (
    <div
      className="relative flex flex-col items-center select-none ml-1"
      style={{ height: Math.max(80, height), width: 24 }}
      title="Layer"
      onMouseDown={(e) => {
        const bar = e.currentTarget;
        const seek = (clientY: number) => {
          const rect = bar.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientY - rect.top - 8) / (rect.height - 16)));
          const layer = Math.round(ratio * (layers - 1));
          setActiveLayer(layer);
          setBlendLayers(false);
        };
        seek(e.clientY);
        const onMove = (ev: MouseEvent) => seek(ev.clientY);
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
    >
      {/* Track */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2 bottom-2 w-[3px] rounded-full bg-purple-900/40" />
      {/* Layer ticks */}
      {Array.from({ length: layers }, (_, i) => {
        const pct = layers <= 1 ? 50 : 8 + (i / (layers - 1)) * 84;
        const isActive = !blendLayers && i === activeLayer;
        return (
          <div
            key={i}
            className={`absolute left-1/2 -translate-x-1/2 rounded-full transition-all duration-75 ${
              isActive
                ? 'w-3 h-3 bg-purple-500 shadow-lg shadow-purple-500/40 z-10'
                : 'w-1.5 h-1.5 bg-purple-400/30 hover:bg-purple-400/60'
            }`}
            style={{ top: `${pct}%`, transform: 'translate(-50%, -50%)' }}
          />
        );
      })}
      {/* Layer label */}
      <div
        className="absolute -right-0.5 text-[7px] font-mono text-purple-400 whitespace-nowrap"
        style={{
          top: blendLayers ? '50%' : `${layers <= 1 ? 50 : 8 + (activeLayer / (layers - 1)) * 84}%`,
          transform: 'translateY(-50%) translateX(100%)',
          paddingLeft: 3,
        }}
      >
        {blendLayers ? 'Blend' : `L${activeLayer}`}
      </div>
    </div>
  );
}
