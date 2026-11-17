import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import type { SceneSlide } from "../../core/types";
import { SLIDE_WIDTH, SLIDE_HEIGHT, snapMove, sourceHitboxes } from "../../core/position-canvas";

type Drag = {
  id: string;
  pointerId: number;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
};

export function CanvasPositionOverlay({
  slide,
  eligibleIds,
  selectedId,
  offsets,
  step,
  disabled,
  onSelect,
  onMove,
  lang,
}: {
  slide: SceneSlide;
  eligibleIds: readonly string[];
  selectedId: string | null;
  offsets?: Record<string, { dx: number; dy: number }>;
  step: 0.05 | 0.1 | 0.25;
  disabled: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  lang: "en" | "id";
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const hitboxes = sourceHitboxes(slide, eligibleIds);
  useEffect(() => {
    dragRef.current = null;
    setDrag(null);
  }, [slide.id, disabled]);

  function pointerDown(event: ReactPointerEvent<SVGRectElement>, id: string) {
    if (disabled || event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    event.preventDefault();
    onSelect(id);
    const next = { id, pointerId: event.pointerId, originX: event.clientX, originY: event.clientY, dx: 0, dy: 0 };
    dragRef.current = next;
    setDrag(next);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<SVGRectElement>) {
    const active = dragRef.current;
    const svg = svgRef.current;
    if (!active || !svg || event.pointerId !== active.pointerId || disabled) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const existing = offsets?.[active.id];
    const dx = snapMove((event.clientX - active.originX) * SLIDE_WIDTH / rect.width, step, existing?.dx || 0);
    const dy = snapMove((event.clientY - active.originY) * SLIDE_HEIGHT / rect.height, step, existing?.dy || 0);
    const next = { ...active, dx, dy };
    dragRef.current = next;
    setDrag(next);
  }

  function pointerFinish(event: ReactPointerEvent<SVGRectElement>, commit: boolean) {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (commit && !disabled && (active.dx !== 0 || active.dy !== 0)) onMove(active.id, active.dx, active.dy);
  }

  function keyboard(event: ReactKeyboardEvent<SVGRectElement>, id: string) {
    if (disabled) return;
    const keys: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    if (keys[event.key]) {
      event.preventDefault();
      onSelect(id);
      onMove(id, ...keys[event.key]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  }

  return (
    <svg
      className="canvas-position-overlay"
      ref={svgRef}
      viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
      aria-label={lang === "id" ? "Pilih atau geser blok teks dan tabel" : "Select or drag text and table blocks"}
      role="group"
    >
      {hitboxes.map((box) => {
        const selected = selectedId === box.id;
        const dx = drag?.id === box.id ? drag.dx : 0;
        const dy = drag?.id === box.id ? drag.dy : 0;
        return (
          <rect
            key={box.id}
            className={selected ? "canvas-position-hitbox selected" : "canvas-position-hitbox"}
            x={box.x + dx} y={box.y + dy} width={box.w} height={box.h}
            rx="0.055"
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-pressed={selected}
            aria-label={lang === "id" ? `Geser blok sumber ${box.id}` : `Move source block ${box.id}`}
            onPointerDown={(event) => pointerDown(event, box.id)}
            onPointerMove={pointerMove}
            onPointerUp={(event) => pointerFinish(event, true)}
            onPointerCancel={(event) => pointerFinish(event, false)}
            onLostPointerCapture={() => { dragRef.current = null; setDrag(null); }}
            onKeyDown={(event) => keyboard(event, box.id)}
          />
        );
      })}
    </svg>
  );
}
