/**
 * Vertical frame animation scrubber for SpritePreview.
 */

interface FrameScrubberProps {
  animationLength: number;
  currentFrame: number;
  setCurrentFrame: (f: number) => void;
  setPlaying: (p: boolean) => void;
  height: number;
}

export function FrameScrubber({ animationLength, currentFrame, setCurrentFrame, setPlaying, height }: FrameScrubberProps) {
  return (
    <div
      className="relative flex flex-col items-center select-none ml-2"
      style={{ height: Math.max(120, height), width: 28 }}
      onMouseDown={(e) => {
        const bar = e.currentTarget;
        const seek = (clientY: number) => {
          const rect = bar.getBoundingClientRect();
          const ratio = Math.max(0, Math.min(1, (clientY - rect.top - 8) / (rect.height - 16)));
          const frame = Math.round(ratio * (animationLength - 1));
          setCurrentFrame(frame);
          setPlaying(false);
        };
        seek(e.clientY);
        const onMove = (ev: MouseEvent) => seek(ev.clientY);
        const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      }}
    >
      {/* Track */}
      <div className="absolute left-1/2 -translate-x-1/2 top-2 bottom-2 w-[3px] rounded-full bg-emperia-border" />
      {/* Frame ticks */}
      {Array.from({ length: animationLength }, (_, i) => {
        const pct = animationLength <= 1 ? 50 : 8 + (i / (animationLength - 1)) * 84;
        return (
          <div
            key={i}
            className={`absolute left-1/2 -translate-x-1/2 rounded-full transition-all duration-75 ${
              i === currentFrame
                ? 'w-3.5 h-3.5 bg-emperia-accent shadow-lg shadow-emperia-accent/40 z-10'
                : 'w-1.5 h-1.5 bg-emperia-muted/40 hover:bg-emperia-muted'
            }`}
            style={{ top: `${pct}%`, transform: 'translate(-50%, -50%)' }}
          />
        );
      })}
      {/* Frame label */}
      <div
        className="absolute -right-1 text-[8px] font-mono text-emperia-accent whitespace-nowrap"
        style={{
          top: `${animationLength <= 1 ? 50 : 8 + (currentFrame / (animationLength - 1)) * 84}%`,
          transform: 'translateY(-50%) translateX(100%)',
          paddingLeft: 4,
        }}
      >
        {currentFrame + 1}/{animationLength}
      </div>
    </div>
  );
}
