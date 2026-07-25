import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface HelpContent {
  title: string;
  scope: 'Client' | 'Server' | 'Client + Server' | 'Derived' | 'Map Editor';
  description: string;
  example: string;
  note?: string;
}

interface TooltipPosition {
  left: number;
  top: number;
  above: boolean;
}

const SCOPE_STYLE: Record<HelpContent['scope'], string> = {
  Client: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  Server: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  'Client + Server': 'border-violet-500/30 bg-violet-500/10 text-violet-300',
  Derived: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  'Map Editor': 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
};

export function HelpTooltip({ content }: { content: HelpContent }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const show = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const tooltipWidth = 320;
    const padding = 12;
    const left = Math.min(
      Math.max(padding, rect.left - tooltipWidth / 2 + rect.width / 2),
      window.innerWidth - tooltipWidth - padding,
    );
    const above = rect.bottom + 190 > window.innerHeight;
    setPosition({
      left,
      top: above ? rect.top - 8 : rect.bottom + 8,
      above,
    });
  };

  const hide = () => setPosition(null);
  const ariaText = `${content.title}. ${content.description} Example: ${content.example}`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={ariaText}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (position) hide();
          else show();
        }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-emperia-border
                   text-[9px] font-semibold leading-none text-emperia-muted transition-colors
                   hover:border-emperia-accent/70 hover:text-emperia-accent focus:border-emperia-accent
                   focus:text-emperia-accent focus:outline-none"
      >
        ?
      </button>
      {position && createPortal(
        <div
          role="tooltip"
          style={{
            left: position.left,
            top: position.top,
            transform: position.above ? 'translateY(-100%)' : undefined,
          }}
          className="pointer-events-none fixed z-[9999] w-80 rounded-lg border border-emperia-border
                     bg-[#111318]/[0.98] p-3 text-left shadow-2xl shadow-black/50"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-semibold text-emperia-text">{content.title}</span>
            <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${SCOPE_STYLE[content.scope]}`}>
              {content.scope}
            </span>
          </div>
          <p className="text-[10px] leading-relaxed text-emperia-muted">{content.description}</p>
          <div className="mt-2 rounded border border-emperia-border/60 bg-black/20 px-2 py-1.5">
            <span className="text-[8px] font-semibold uppercase tracking-wider text-emperia-accent">Practical example</span>
            <p className="mt-0.5 text-[10px] leading-relaxed text-emperia-text/90">{content.example}</p>
          </div>
          {content.note && (
            <p className="mt-2 border-t border-emperia-border/50 pt-2 text-[9px] leading-relaxed text-amber-300/80">
              {content.note}
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
