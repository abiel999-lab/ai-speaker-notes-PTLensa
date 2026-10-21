import { useId } from "react";
import type { SceneSlide } from "../core/types";
import { shapePolygon } from "../core/shapes";
export function Slide({
  slide,
  label,
  generationId,
  imageUrl,
  projectId,
}: {
  slide: SceneSlide;
  label?: string;
  generationId?: string;
  imageUrl?: string;
  projectId?: string;
}) {
  const prefix = useId().replaceAll(":", "");
  return (
    <svg
      viewBox="0 0 13.333333 7.5"
      role="img"
      aria-label={label || "Presentation slide"}
      className="scene"
    >
      <rect width="13.333333" height="7.5" fill={slide.background} />
      {slide.objects.map((o, i) => {
        if (o.type === "shape")
          return o.shape === "ellipse" ? (
            <ellipse
              key={i}
              cx={o.x + o.w / 2}
              cy={o.y + o.h / 2}
              rx={o.w / 2}
              ry={o.h / 2}
              fill={o.fill}
              fillOpacity={o.fillOpacity ?? 1}
              stroke={o.stroke || undefined}
              strokeWidth={(o.strokeWidth ?? .8) / 72}
            />
          ) : o.shape === "line" ? (
            <line
              key={i}
              x1={o.x}
              y1={o.y}
              x2={o.x + o.w}
              y2={o.y + o.h}
              stroke={o.stroke || o.fill}
              strokeOpacity={o.fillOpacity ?? 1}
              strokeWidth={(o.strokeWidth ?? .8) / 72}
            />
          ) : shapePolygon(o.shape) ? (
            <polygon key={i} points={shapePolygon(o.shape)!.map(([x, y]) => `${o.x + x * o.w},${o.y + y * o.h}`).join(" ")}
              fill={o.fill} fillOpacity={o.fillOpacity ?? 1} stroke={o.stroke || undefined} strokeWidth={(o.strokeWidth ?? .8) / 72} />
          ) : (
            <rect
              key={i}
              x={o.x}
              y={o.y}
              width={o.w}
              height={o.h}
              fill={o.fill}
              rx={o.shape === "roundRect" ? Math.min(o.w, o.h) * .16 : 0}
              fillOpacity={o.fillOpacity ?? 1}
              stroke={o.stroke || undefined}
              strokeWidth={(o.strokeWidth ?? .8) / 72}
            />
          );
        if (o.type === "image")
          return (
            <g key={i}><image
              href={
                o.asset === "custom"
                  ? imageUrl || `/api/generations/${generationId}/image`
                  : o.asset && o.asset !== "city" && projectId
                    ? `/api/projects/${projectId}/image/${o.asset}`
                    : "/assets/city.jpg"
              }
              x={o.x}
              y={o.y}
              width={o.w}
              height={o.h}
              preserveAspectRatio="xMidYMid slice"
            />
              {o.imageTreatment && o.imageTreatment !== "none" && <rect x={o.backgroundImage && o.imageTextSide === "right" ? 13.333333 - 8.4 : o.x} y={o.y}
                width={o.backgroundImage && ["left", "right"].includes(o.imageTextSide || "") ? 8.4 : o.w} height={o.h}
                fill={o.imageTreatment === "dark" ? "#0D1323" : "#FFFFFF"} fillOpacity={o.imageTreatment === "dark" ? .86 : .90} />}
              {o.backgroundImage && o.imageTreatment && o.imageTreatment !== "none" && ["left", "right"].includes(o.imageTextSide || "") && <>
                <defs><linearGradient id={`${prefix}-${i}`}><stop offset="0" stopColor={o.imageTreatment === "dark" ? "#0D1323" : "#FFFFFF"} stopOpacity={o.imageTextSide === "left" ? (o.imageTreatment === "dark" ? .86 : .9) : 0}/><stop offset="1" stopColor={o.imageTreatment === "dark" ? "#0D1323" : "#FFFFFF"} stopOpacity={o.imageTextSide === "right" ? (o.imageTreatment === "dark" ? .86 : .9) : 0}/></linearGradient></defs>
                <rect x={o.imageTextSide === "left" ? 8.4 : 13.333333 - 8.4 - .75} y={o.y} width={.75} height={o.h} fill={`url(#${prefix}-${i})`} />
              </>}
            </g>
          );
        if (o.type === "text")
          return (
            <text
              key={i}
              x={o.align === "center" ? o.x + o.w / 2 : o.align === "right" ? o.x + o.w : o.x}
              y={o.y + (o.fontSize! / 72) * 0.95}
              fill={o.color}
              fontFamily="Studio Sans, Arial, sans-serif"
              fontSize={o.fontSize! / 72}
              fontWeight={o.bold ? 700 : 400}
              textAnchor={o.align === "center" ? "middle" : o.align === "right" ? "end" : "start"}
            >
              {(o.lines || [o.text || ""]).map((line, j) => (
                <tspan
                  key={j}
                  x={o.align === "center" ? o.x + o.w / 2 : o.align === "right" ? o.x + o.w : o.x}
                  dy={j === 0 ? 0 : (o.fontSize! * 1.28) / 72}
                >
                  {line}
                </tspan>
              ))}
            </text>
          );
        if (o.type === "table") {
          const cw = o.w / (o.rows?.[0]?.length || 1);
          return (
            <g key={i}>
              {o.rows?.flatMap((row, r) =>
                row.map((cell, c) => {
                  const top =
                      o.y +
                      (o.rowHeights?.slice(0, r).reduce((a, b) => a + b, 0) ||
                        0),
                    rh = o.rowHeights?.[r] || o.h / (o.rows?.length || 1);
                  return (
                    <g key={`${r}-${c}`}>
                      <rect
                        x={o.x + c * cw}
                        y={top}
                        width={cw}
                        height={rh}
                        fill={o.fill}
                        stroke={slide.background}
                        strokeWidth=".015"
                      />
                      <text
                        x={o.x + c * cw + 0.12}
                        y={top + 0.3}
                        fontFamily="Studio Sans, Arial"
                        fontSize={o.fontSize! / 72}
                        fill={o.color}
                      >
                        {(o.cellLines?.[r]?.[c] || [cell]).map((line, j) => (
                          <tspan
                            key={j}
                            x={o.x + c * cw + 0.12}
                            dy={j === 0 ? 0 : (o.fontSize! * 1.28) / 72}
                          >
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                }),
              )}
            </g>
          );
        }
      })}
    </svg>
  );
}
