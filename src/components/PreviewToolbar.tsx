import { useRef, useState } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Grid3X3, Grid2X2, ImageDown, ImageUp, Download, Upload, Crop, Eye, Copy, ClipboardPaste, Pin, PinOff, UserRound, MoreHorizontal, SquareDashed } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import { clearSpriteCache } from '../lib/sprite-decoder';
import { encodeOBD, decodeOBD } from '../lib/obd';
import { exportSelectedSpriteSheets } from '../lib/export-sprites';
import type { ThingType, FrameGroup, ObjectData, SpriteData } from '../lib/types';
import type { OutfitColorIndices } from '../lib/outfit-colors';

interface PreviewToolbarProps {
  thing: ThingType;
  group: FrameGroup | null;
  objectData: ObjectData | null;
  spriteData: SpriteData | null;
  spriteOverrides: Map<number, ImageData>;
  category: string;
  showGrid: boolean;
  setShowGrid: (g: boolean) => void;
  showCropSize: boolean;
  setShowCropSize: (c: boolean) => void;
  showDisplacementGuide: boolean;
  setShowDisplacementGuide: (show: boolean) => void;
  previewMode: boolean;
  setPreviewMode: (p: boolean) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  currentFrame: number;
  setCurrentFrame: (f: number) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handleImageFiles: (files: FileList, dropX?: number, dropY?: number) => void;
  copyMenuOpen: boolean;
  setCopyMenuOpen: (o: boolean) => void;
  copyMenuRef: React.RefObject<HTMLDivElement | null>;
  baseOutfitId: number | null;
  setBaseOutfitId: (id: number | null) => void;
  showEffectOutfitReference: boolean;
  setShowEffectOutfitReference: (show: boolean) => void;
}

export function PreviewToolbar({
  thing, group, objectData, spriteData, spriteOverrides, category,
  showGrid, setShowGrid, showCropSize, setShowCropSize,
  showDisplacementGuide, setShowDisplacementGuide,
  previewMode, setPreviewMode, playing, setPlaying, currentFrame, setCurrentFrame,
  canvasRef, handleImageFiles, copyMenuOpen, setCopyMenuOpen, copyMenuRef,
  baseOutfitId, setBaseOutfitId,
  showEffectOutfitReference, setShowEffectOutfitReference,
}: PreviewToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const obdImportRef = useRef<HTMLInputElement>(null);
  const fileMenuRef = useRef<HTMLDetailsElement>(null);

  const isAnimated = group ? group.animationLength > 1 : false;
  const closeFileMenu = () => fileMenuRef.current?.removeAttribute('open');

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `sprite_${thing.id}_frame${currentFrame}.png`;
    a.click();
  };

  const handleExportOBD = () => {
    if (!spriteData) return;
    try {
      const compressed = encodeOBD({
        thing,
        clientVersion: 1098,
        spriteData,
        spriteOverrides,
      });
      const blob = new Blob([new Uint8Array(compressed) as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dId = objectData ? getDisplayId(objectData, thing.id) : thing.id;
      a.download = `${category}_${dId}.obd`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const handleExportSpriteSheet = async () => {
    if (!objectData || !spriteData) return;
    const state = useOBStore.getState();
    try {
      await exportSelectedSpriteSheets([thing.id], {
        objectData,
        spriteData,
        spriteOverrides,
        itemDefinitions: state.itemDefinitions,
        appearanceToItemIds: state.appearanceToItemIds,
      });
    } catch (error) {
      alert(`Sprite sheet export failed: ${error instanceof Error ? error.message : error}`);
    }
  };

  const handleImportOBD = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const results: string[] = [];
    const errors: string[] = [];
    let isFirst = true;

    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      try {
        const arrayBuf = await file.arrayBuffer();
        const buf = new Uint8Array(arrayBuf);
        const result = decodeOBD(buf);

        const state = useOBStore.getState();
        const selectedId = state.selectedThingId;
        const existingThing = selectedId != null ? state.objectData?.things.get(selectedId) : null;

        // Only replace on the first file if selected thing matches category
        if (isFirst && selectedId != null && existingThing && existingThing.category === result.category) {
          const ok = state.replaceThing(selectedId, result.flags, result.frameGroups, result.spritePixels);
          if (ok) {
            const od = useOBStore.getState().objectData;
            const dId = od ? getDisplayId(od, selectedId) : selectedId;
            results.push(`Replaced ${result.category} #${dId} (${file.name})`);
          } else {
            errors.push(`${file.name}: replace failed`);
          }
        } else {
          const newId = state.importThing(result.category, result.flags, result.frameGroups, result.spritePixels);
          if (newId != null) {
            const od = useOBStore.getState().objectData;
            const dId = od ? getDisplayId(od, newId) : newId;
            results.push(`Imported ${result.category} #${dId} (${file.name})`);
          } else {
            errors.push(`${file.name}: import failed`);
          }
        }
        isFirst = false;
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : err}`);
      }
    }

    const msg = [
      ...results,
      ...(errors.length > 0 ? ['', 'Errors:', ...errors] : []),
    ].join('\n');
    alert(msg || 'No files processed.');
    e.target.value = '';
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-t border-emperia-border px-3 py-1.5">
      <div className="flex min-w-0 items-center gap-1">
        {/* View toggles */}
        <button onClick={() => setShowGrid(!showGrid)} className={`p-1 rounded transition-colors ${showGrid ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title="Toggle Grid">
          <Grid3X3 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setShowCropSize(!showCropSize)} className={`p-1 rounded transition-colors ${showCropSize ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title="Toggle Crop Outline">
          <Crop className="w-3.5 h-3.5" />
        </button>
        {group && (group.patternX > 1 || group.patternY > 1) && (
          <button onClick={() => setPreviewMode(!previewMode)} className={`p-1 rounded transition-colors ${previewMode ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title="Toggle Preview Mode">
            <Eye className="w-3.5 h-3.5" />
          </button>
        )}
        {thing.flags.hasDisplacement && (
          <button
            onClick={() => setShowDisplacementGuide(!showDisplacementGuide)}
            className={`p-1 rounded transition-colors ${showDisplacementGuide ? 'bg-yellow-400/15 text-yellow-400' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`}
            title={showDisplacementGuide ? 'Hide displacement guide' : 'Show displacement guide'}
          >
            <SquareDashed className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Hidden import inputs used by the centered file menu. */}
      <input ref={fileInputRef} type="file" accept="image/png,image/gif,image/bmp" className="hidden" onChange={(e) => e.target.files && handleImageFiles(e.target.files)} />
      <input ref={obdImportRef} type="file" accept=".obd" multiple className="hidden" onChange={handleImportOBD} />

      {/* Compact import/export menu, centered independently of side controls. */}
      <details ref={fileMenuRef} className="relative z-30 justify-self-center">
        <summary
          className="flex cursor-pointer list-none items-center gap-1 rounded border border-emperia-border bg-emperia-surface px-2 py-1 text-[10px] font-medium text-emperia-muted transition-colors hover:border-emperia-accent/50 hover:text-emperia-text"
          title="Import / Export"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
          Files
        </summary>
        <div className="absolute bottom-full left-1/2 mb-1 w-44 -translate-x-1/2 overflow-hidden rounded border border-emperia-border bg-emperia-surface py-1 shadow-lg">
          <button
            onClick={() => { closeFileMenu(); fileInputRef.current?.click(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-emperia-text hover:bg-emperia-hover"
          >
            <ImageUp className="h-3.5 w-3.5 text-emperia-muted" /> Import PNG
          </button>
          <button
            onClick={() => { closeFileMenu(); obdImportRef.current?.click(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-emperia-text hover:bg-emperia-hover"
          >
            <Upload className="h-3.5 w-3.5 text-emperia-muted" /> Import OBD
          </button>
          <div className="my-1 border-t border-emperia-border" />
          <button
            onClick={() => { closeFileMenu(); handleExport(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-emperia-text hover:bg-emperia-hover"
          >
            <ImageDown className="h-3.5 w-3.5 text-emperia-muted" /> Export PNG
          </button>
          <button
            onClick={() => { closeFileMenu(); void handleExportSpriteSheet(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-emperia-text hover:bg-emperia-hover"
          >
            <Grid2X2 className="h-3.5 w-3.5 text-emperia-muted" /> Export Sprite Sheet
          </button>
          <button
            onClick={() => { closeFileMenu(); handleExportOBD(); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-emperia-text hover:bg-emperia-hover"
          >
            <Download className="h-3.5 w-3.5 text-emperia-muted" /> Export OBD
          </button>
        </div>
      </details>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1">
        <div className="w-px h-4 bg-emperia-border mx-0.5" />

      {/* Copy / Paste item properties */}
      <CopyPasteMenu
        thing={thing}
        copyMenuOpen={copyMenuOpen}
        setCopyMenuOpen={setCopyMenuOpen}
        copyMenuRef={copyMenuRef}
      />

      {/* Animation controls */}
      {isAnimated && (
        <>
          <div className="w-px h-4 bg-emperia-border mx-0.5" />
          <button onClick={() => { setCurrentFrame((currentFrame - 1 + (group?.animationLength ?? 1)) % (group?.animationLength ?? 1)); setPlaying(false); }} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Previous frame">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setPlaying(!playing)} className={`p-1 rounded transition-colors ${playing ? 'bg-emperia-accent/20 text-emperia-accent' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`} title={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => { setCurrentFrame((currentFrame + 1) % (group?.animationLength ?? 1)); setPlaying(false); }} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Next frame">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-emperia-muted">{currentFrame + 1}/{group?.animationLength}</span>
        </>
      )}

      {/* Base #134 is available for both outfit and equipment previews. */}
      {(category === 'outfit' || category === 'equipment') && objectData && (
        <>
          <div className="flex items-center gap-0.5">
            {baseOutfitId != null && baseOutfitId !== thing.id && (
              <span className="text-[9px] text-amber-400/70 mr-0.5">Base: #{getDisplayId(objectData, baseOutfitId)}</span>
            )}
            {(() => {
              const baseCharId = objectData.itemCount + 134;
              const isCharPinned = baseOutfitId === baseCharId;
              return (
                <button
                  onClick={() => setBaseOutfitId(isCharPinned ? null : baseCharId)}
                  className={`p-1 rounded transition-colors ${isCharPinned ? 'bg-sky-500/20 text-sky-400' : 'text-emperia-muted hover:text-sky-400 hover:bg-sky-500/10'}`}
                  title={isCharPinned ? 'Unpin character base (#134)' : 'Pin character base (#134)'}
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span className="sr-only">134</span>
                </button>
              );
            })()}
            {category === 'outfit' && (
              <button
                onClick={() => setBaseOutfitId(baseOutfitId === thing.id ? null : thing.id)}
                className={`p-1 rounded transition-colors ${baseOutfitId === thing.id ? 'bg-amber-500/20 text-amber-400' : baseOutfitId != null ? 'bg-amber-500/10 text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/20' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`}
                title={baseOutfitId === thing.id ? 'Unpin base outfit' : baseOutfitId != null ? 'Replace pinned base with this outfit' : 'Pin current as base outfit'}
              >
                {baseOutfitId === thing.id ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </>
      )}

      {category === 'effect' && objectData && (
        <>
          <button
            onClick={() => setShowEffectOutfitReference(!showEffectOutfitReference)}
            className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${
              showEffectOutfitReference
                ? 'bg-sky-500/20 text-sky-400'
                : 'text-emperia-muted hover:text-sky-400 hover:bg-sky-500/10'
            }`}
            title={showEffectOutfitReference ? 'Hide outfit #135 reference' : 'Show outfit #135 behind the effect'}
          >
            <UserRound className="w-3.5 h-3.5" />
            <span className="text-[9px]">Outfit 135</span>
          </button>
        </>
      )}
      </div>
    </div>
  );
}

const COPY_PARTS = [
  { key: 'flags' as const, label: 'Flags' },
  { key: 'sprites' as const, label: 'Sprites' },
  { key: 'server' as const, label: 'Server Properties' },
];

function CopyPasteMenu({
  thing,
  copyMenuOpen,
  setCopyMenuOpen,
  copyMenuRef,
}: {
  thing: ThingType;
  copyMenuOpen: boolean;
  setCopyMenuOpen: (o: boolean) => void;
  copyMenuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [copyFlags, setCopyFlags] = useState(true);
  const [copySprites, setCopySprites] = useState(true);
  const [copyServer, setCopyServer] = useState(true);

  const anyChecked = copyFlags || copySprites || copyServer;

  const handleCopy = () => {
    if (!anyChecked) return;
    const { appearanceToItemIds, itemDefinitions } = useOBStore.getState();
    const itemId = appearanceToItemIds.get(thing.id);
    const itemDefinition = itemId != null ? itemDefinitions.get(itemId) ?? null : null;
    const parts: string[] = [];
    const copied: NonNullable<typeof useOBStore extends { getState: () => infer S } ? S extends { copiedThing: infer C } ? C : never : never> = {};
    if (copyFlags) {
      copied.flags = { ...thing.flags };
      parts.push('Flags');
    }
    if (copySprites) {
      copied.frameGroups = thing.frameGroups.map(fg => ({ ...fg, sprites: [...fg.sprites], animationLengths: fg.animationLengths.map(a => ({ ...a })) }));
      parts.push('Sprites');
    }
    if (copyServer) {
      copied.itemDefinition = itemDefinition ? { ...itemDefinition, properties: itemDefinition.properties ? { ...itemDefinition.properties } : null } : null;
      parts.push('Server');
    }
    copied.label = parts.join(' + ');
    useOBStore.setState({ copiedThing: copied });
    setCopyMenuOpen(false);
  };

  return (
    <>
      <div className="relative" ref={copyMenuRef as React.LegacyRef<HTMLDivElement>}>
        <button
          onClick={() => setCopyMenuOpen(!copyMenuOpen)}
          className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text"
          title="Copy properties"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        {copyMenuOpen && (
          <div
            className="absolute bottom-full mb-1 left-0 bg-emperia-surface border border-emperia-border rounded shadow-lg py-1.5 z-50 min-w-[170px]"
          >
            {COPY_PARTS.map(({ key, label }) => {
              const checked = key === 'flags' ? copyFlags : key === 'sprites' ? copySprites : copyServer;
              const toggle = key === 'flags' ? setCopyFlags : key === 'sprites' ? setCopySprites : setCopyServer;
              return (
                <label
                  key={key}
                  className="flex items-center gap-2 px-3 py-1 text-[11px] text-emperia-text hover:bg-emperia-hover transition-colors cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(!checked)}
                    className="accent-emperia-accent w-3 h-3"
                  />
                  {label}
                </label>
              );
            })}
            <div className="px-3 pt-1.5 mt-1 border-t border-emperia-border">
              <button
                onClick={handleCopy}
                disabled={!anyChecked}
                className={`w-full px-2 py-1 text-[11px] font-medium rounded transition-colors ${
                  anyChecked
                    ? 'bg-emperia-accent/20 text-emperia-accent hover:bg-emperia-accent/30'
                    : 'bg-emperia-border/20 text-emperia-muted/40 cursor-not-allowed'
                }`}
              >
                Copy
              </button>
            </div>
          </div>
        )}
      </div>
      <button
        onClick={() => {
          const { copiedThing } = useOBStore.getState();
          if (!copiedThing) return;
          const store = useOBStore.getState();
          const newDirtyIds = new Set(store.dirtyIds);
          newDirtyIds.add(thing.id);
          if (copiedThing.frameGroups) {
            thing.frameGroups = copiedThing.frameGroups.map(fg => ({ ...fg, sprites: [...fg.sprites], animationLengths: fg.animationLengths.map(a => ({ ...a })) }));
          }
          thing.rawBytes = undefined;
          clearSpriteCache();
          if (copiedThing.itemDefinition && thing.category === 'item') {
            const { appearanceToItemIds, itemDefinitions } = store;
            const itemId = appearanceToItemIds.get(thing.id);
            if (itemId != null) {
              const newDefs = new Map(itemDefinitions);
              newDefs.set(itemId, {
                ...copiedThing.itemDefinition,
                itemId,
                appearanceId: thing.id,
              });
              useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1, itemDefinitions: newDefs });
            }
          }
          if (copiedThing.flags) {
            store.updateThingFlags(thing.id, { ...copiedThing.flags });
          } else {
            useOBStore.setState({ dirty: true, dirtyIds: newDirtyIds, editVersion: store.editVersion + 1 });
          }
        }}
        disabled={!useOBStore.getState().copiedThing}
        className={`p-1 rounded transition-colors ${
          useOBStore.getState().copiedThing
            ? 'hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text'
            : 'text-emperia-muted/30 cursor-not-allowed'
        }`}
        title={useOBStore.getState().copiedThing?.label ? `Paste: ${useOBStore.getState().copiedThing!.label}` : 'Paste properties'}
      >
        <ClipboardPaste className="w-3.5 h-3.5" />
      </button>
    </>
  );
}
