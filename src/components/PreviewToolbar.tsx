import { useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Grid3X3, ImageDown, ImageUp, Download, Upload, Crop, Eye, Copy, ClipboardPaste, Pin, PinOff } from 'lucide-react';
import { useOBStore, getDisplayId } from '../store';
import { clearSpriteCache } from '../lib/sprite-decoder';
import { encodeOBD, decodeOBD } from '../lib/obd';
import type { ThingType, FrameGroup, ObjectData, SpriteData } from '../lib/types';
import type { OutfitColorIndices } from '../lib/outfit-colors';

interface PreviewToolbarProps {
  thing: ThingType;
  group: FrameGroup | null;
  objectData: ObjectData | null;
  spriteData: SpriteData | null;
  spriteOverrides: Map<number, ImageData>;
  category: string;
  zoom: number;
  setZoom: (z: number) => void;
  showGrid: boolean;
  setShowGrid: (g: boolean) => void;
  showCropSize: boolean;
  setShowCropSize: (c: boolean) => void;
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
}

export function PreviewToolbar({
  thing, group, objectData, spriteData, spriteOverrides, category,
  zoom, setZoom, showGrid, setShowGrid, showCropSize, setShowCropSize,
  previewMode, setPreviewMode, playing, setPlaying, currentFrame, setCurrentFrame,
  canvasRef, handleImageFiles, copyMenuOpen, setCopyMenuOpen, copyMenuRef,
  baseOutfitId, setBaseOutfitId,
}: PreviewToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const obdImportRef = useRef<HTMLInputElement>(null);

  const isAnimated = group ? group.animationLength > 1 : false;

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

  const handleImportOBD = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const buf = new Uint8Array(reader.result as ArrayBuffer);
        const result = decodeOBD(buf);

        const state = useOBStore.getState();
        const selectedId = state.selectedThingId;
        const existingThing = selectedId != null ? state.objectData?.things.get(selectedId) : null;

        if (selectedId != null && existingThing && existingThing.category === result.category) {
          const ok = state.replaceThing(selectedId, result.flags, result.frameGroups, result.spritePixels);
          if (ok) {
            const od = useOBStore.getState().objectData;
            const dId = od ? getDisplayId(od, selectedId) : selectedId;
            alert(`Replaced ${result.category} #${dId} with ${result.spritePixels.size} sprites.`);
          } else {
            alert('Replace failed — could not overwrite selected thing.');
          }
        } else {
          const newId = state.importThing(result.category, result.flags, result.frameGroups, result.spritePixels);
          if (newId != null) {
            const od = useOBStore.getState().objectData;
            const dId = od ? getDisplayId(od, newId) : newId;
            alert(`Imported ${result.category} #${dId} with ${result.spritePixels.size} sprites.`);
          }
        }
      } catch (err) {
        alert(`Import failed: ${err instanceof Error ? err.message : err}`);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div className="flex items-center px-3 py-1.5 gap-1 border-t border-emperia-border flex-wrap">
      {/* Zoom */}
      <button onClick={() => setZoom(Math.max(1, zoom - 1))} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Zoom out">
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <span className="text-[10px] text-emperia-muted w-6 text-center">{zoom}x</span>
      <button onClick={() => setZoom(Math.min(8, zoom + 1))} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Zoom in">
        <ZoomIn className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-emperia-border mx-0.5" />

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

      <div className="w-px h-4 bg-emperia-border mx-0.5" />

      {/* Import / Export PNG */}
      <input ref={fileInputRef} type="file" accept="image/png,image/gif,image/bmp" className="hidden" onChange={(e) => e.target.files && handleImageFiles(e.target.files)} />
      <button onClick={() => fileInputRef.current?.click()} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Import PNG">
        <ImageUp className="w-3.5 h-3.5" />
      </button>
      <button onClick={handleExport} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Export PNG">
        <ImageDown className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-4 bg-emperia-border mx-0.5" />

      {/* Import / Export OBD */}
      <input ref={obdImportRef} type="file" accept=".obd" className="hidden" onChange={handleImportOBD} />
      <button onClick={() => obdImportRef.current?.click()} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Import OBD">
        <Upload className="w-3.5 h-3.5" />
      </button>
      <button onClick={handleExportOBD} className="p-1 rounded hover:bg-emperia-hover text-emperia-muted hover:text-emperia-text" title="Export OBD">
        <Download className="w-3.5 h-3.5" />
      </button>

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

      {/* Pin base outfit controls — pushed to far right (outfit category only) */}
      {category === 'outfit' && objectData && (
        <>
          <div className="flex-1" />
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
                  title={isCharPinned ? 'Unpin character base (#134)' : 'Pin outfit #134 as base'}
                >
                  <Pin className="w-3.5 h-3.5" />
                  <span className="sr-only">134</span>
                </button>
              );
            })()}
            <button
              onClick={() => setBaseOutfitId(baseOutfitId === thing.id ? null : thing.id)}
              className={`p-1 rounded transition-colors ${baseOutfitId === thing.id ? 'bg-amber-500/20 text-amber-400' : baseOutfitId != null ? 'bg-amber-500/10 text-amber-400/60 hover:text-amber-400 hover:bg-amber-500/20' : 'text-emperia-muted hover:text-emperia-text hover:bg-emperia-hover'}`}
              title={baseOutfitId === thing.id ? 'Unpin base outfit' : baseOutfitId != null ? 'Replace pinned base with this outfit' : 'Pin current as base outfit'}
            >
              {baseOutfitId === thing.id ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

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
            className="absolute bottom-full mb-1 left-0 bg-emperia-surface border border-emperia-border rounded shadow-lg py-1 z-50 min-w-[160px]"
            onClick={() => setCopyMenuOpen(false)}
          >
            {[
              { label: 'Everything', key: 'all' },
              { label: 'Flags Only', key: 'flags' },
              { label: 'Server Properties', key: 'server' },
              { label: 'Sprites Only', key: 'sprites' },
            ].map(({ label, key }) => (
              <button
                key={key}
                className="w-full text-left px-3 py-1.5 text-[11px] text-emperia-text hover:bg-emperia-hover transition-colors"
                onClick={() => {
                  const { clientToServerIds, itemDefinitions } = useOBStore.getState();
                  const serverId = clientToServerIds.get(thing.id);
                  const serverDef = serverId != null ? itemDefinitions.get(serverId) ?? null : null;
                  const copied: NonNullable<typeof useOBStore extends { getState: () => infer S } ? S extends { copiedThing: infer C } ? C : never : never> = { label };
                  if (key === 'all' || key === 'flags') {
                    copied.flags = { ...thing.flags };
                  }
                  if (key === 'all' || key === 'sprites') {
                    copied.frameGroups = thing.frameGroups.map(fg => ({ ...fg, sprites: [...fg.sprites], animationLengths: fg.animationLengths.map(a => ({ ...a })) }));
                  }
                  if (key === 'all' || key === 'server') {
                    copied.serverDef = serverDef ? { ...serverDef, properties: serverDef.properties ? { ...serverDef.properties } : null } : null;
                  }
                  useOBStore.setState({ copiedThing: copied });
                }}
              >
                {label}
              </button>
            ))}
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
          if (copiedThing.serverDef && thing.category === 'item') {
            const { clientToServerIds, itemDefinitions } = store;
            const serverId = clientToServerIds.get(thing.id);
            if (serverId != null) {
              const newDefs = new Map(itemDefinitions);
              newDefs.set(serverId, {
                ...copiedThing.serverDef,
                serverId,
                id: thing.id,
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
