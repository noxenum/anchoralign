import { useState, useRef, useCallback } from 'react';
import { ACCEPTED_IMAGE_TYPES } from '@/constants';
import { useFittedFrame } from '@/hooks/useFittedFrame';
import {
  DEFAULT_PX_PER_MM, affineToCssTransform, applyAffine, framePointToImage, inverseAffine, markerRadius, placementArcPath,
} from '@/lib/geometry';
import type { Affine6, ImageKey, ImageSize, LandmarkKey, PlacementArcGuide, Point, RoiConfig } from '@/types';
import { ImageUp } from 'lucide-react';
import { Loupe } from './Loupe';

// Cephalometric canvas: image frame (img) plus an SVG overlay for points and ROIs.
// The pane shows a coordinate frame (by default the image itself); `affineMatrix`
// maps native image pixels into it and is applied to the img layer as a CSS
// matrix. Points are given and reported in native image pixels.

// Used until the worker reports the native image size.
export const FALLBACK_IMAGE_SIZE: ImageSize = { width: 1439, height: 1513 };

export type CephPaneProps = {
  imgSrc: string | null;
  label: string;
  dateStr: string;
  active: boolean;
  pendingPoint: { key: LandmarkKey } | null;
  points: { rp1: Point | null; rp2: Point | null };
  roi: RoiConfig;
  showVector: boolean;
  showAnnotations?: boolean;
  affineMatrix?: Affine6 | null;
  // Size of the displayed frame when it differs from the image, e.g. T1's frame
  // for a transformed T2.
  frameSize?: ImageSize | null;
  // Only one reference point per image: RP2 coincides with RP1 and is not drawn.
  singlePoint?: boolean;
  onPlace?: (key: LandmarkKey, point: Point) => void;
  paneId: ImageKey;
  pxPerMm?: number;
  onFileDrop?: (file: File) => void;
  placementGuide?: PlacementArcGuide | null;
  imageSize?: { width: number | null; height: number | null };
};

export function CephPane({
  imgSrc,
  label,
  dateStr,
  active,
  pendingPoint,
  points,
  roi,
  showVector,
  showAnnotations = true,
  affineMatrix,
  frameSize,
  singlePoint = false,
  onPlace,
  paneId,
  pxPerMm = DEFAULT_PX_PER_MM,
  onFileDrop,
  placementGuide,
  imageSize,
}: CephPaneProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState<Point | null>(null); // frame coords
  const imageWidth = imageSize?.width ?? FALLBACK_IMAGE_SIZE.width;
  const imageHeight = imageSize?.height ?? FALLBACK_IMAGE_SIZE.height;
  const frameWidth = frameSize?.width ?? imageWidth;
  const frameHeight = frameSize?.height ?? imageHeight;
  const frameRect = useFittedFrame(paneRef, frameWidth / frameHeight);
  const scaleX = frameRect.w / frameWidth;
  const scaleY = frameRect.h / frameHeight;

  // map screen px → frame coords
  const screenToFrame = useCallback((sx: number, sy: number) => {
    if (!frameRef.current) return { x: 0, y: 0 };
    const r = frameRef.current.getBoundingClientRect();
    return framePointToImage({ x: sx, y: sy }, r, { width: frameWidth, height: frameHeight });
  }, [frameHeight, frameWidth]);

  const inFrame = (p: Point) => p.x >= 0 && p.x <= frameWidth && p.y >= 0 && p.y <= frameHeight;

  const handleClick = (e: React.MouseEvent) => {
    if (!active || !pendingPoint) return;
    const p = screenToFrame(e.clientX, e.clientY);
    if (!inFrame(p)) return;
    const native = affineMatrix ? applyAffine(inverseAffine(affineMatrix), p) : p;
    if (native.x < 0 || native.x > imageWidth || native.y < 0 || native.y > imageHeight) return;
    onPlace?.(pendingPoint.key, native);
  };

  const handleMove = (e: React.MouseEvent) => {
    const p = screenToFrame(e.clientX, e.clientY);
    setHover(inFrame(p) ? p : null);
  };

  const roiPx = {
    rp1: roi?.rp1 ? { w: roi.rp1.w * pxPerMm, h: roi.rp1.h * pxPerMm } : null,
    rp2: roi?.rp2 ? { w: roi.rp2.w * pxPerMm, h: roi.rp2.h * pxPerMm } : null,
  };

  const showLoupe = active && pendingPoint && hover;
  const [draggingFile, setDraggingFile] = useState(false);
  const cssTransform = affineMatrix ? affineToCssTransform(affineMatrix, scaleX, scaleY) : '';

  // Recompute from native landmarks on every render, never from a previous display state.
  // Only their centres move: labels stay horizontal and ROI boxes stay axis-aligned.
  const displayPoints = {
    rp1: points.rp1 && affineMatrix ? applyAffine(affineMatrix, points.rp1) : points.rp1,
    rp2: singlePoint ? null : points.rp2 && affineMatrix ? applyAffine(affineMatrix, points.rp2) : points.rp2,
  };
  // An image in its own frame fills it; otherwise it is drawn at its native size.
  const imageBox = frameSize
    ? { left: 0, top: 0, width: `${imageWidth * scaleX}px`, height: `${imageHeight * scaleY}px`, maxWidth: 'none' }
    : { inset: 0, width: '100%', height: '100%' };

  const handleDragOver = (e: React.DragEvent) => {
    if (!onFileDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDraggingFile(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!onFileDrop) return;
    e.preventDefault();
    setDraggingFile(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
    if (file) onFileDrop(file);
  };

  return (
    <div
      className={`canvas-pane ${draggingFile ? 'dragging-file' : ''} ${!imgSrc ? 'empty' : ''}`}
      ref={paneRef}
      data-pane={paneId}
      onMouseMove={handleMove}
      onMouseLeave={() => setHover(null)}
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={() => setDraggingFile(false)}
      onDrop={handleDrop}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div className="pane-label">
        {active && <span className="active-mark" />}
        <span className="tag">{label}</span>
        <span className="date">{dateStr}</span>
      </div>

      <div
        className="img-frame"
        ref={frameRef}
        style={{
          position: 'relative',
          width: frameRect.w ? `${frameRect.w}px` : '0',
          height: frameRect.h ? `${frameRect.h}px` : '0',
          cursor: active && pendingPoint ? 'crosshair' : 'default',
          overflow: 'hidden',
          background: 'oklch(0 0 0)',
        }}
      >
        {/* Base image */}
        {imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            draggable={false}
            style={{
              position: 'absolute',
              ...imageBox,
              transform: cssTransform || 'none',
              transformOrigin: '0 0',
              transition: 'none',
              userSelect: 'none',
              pointerEvents: 'none',
              display: 'block',
            }}
          />
        ) : (
          // Opens the same file picker as the upload button in the top bar.
          <>
            <button type="button" className="drop-empty" disabled={!onFileDrop} onClick={() => fileInput.current?.click()}>
              <ImageUp size={28} strokeWidth={1.5} />
              <span className="drop-title">Drop the {label} image here or click to browse</span>
              <span className="drop-sub">JPEG, PNG or WebP</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Allow selecting the same file again.
                event.target.value = '';
                if (file) onFileDrop?.(file);
              }}
            />
          </>
        )}

        {/* SVG overlay: centres in the displayed image frame, labels and boxes unrotated */}
        {imgSrc && showAnnotations && <svg
          className="ceph-svg-overlay"
          viewBox={`0 0 ${frameWidth} ${frameHeight}`}
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          {/* Vector RP1→RP2 */}
          {showVector && displayPoints.rp1 && displayPoints.rp2 && (
            <g>
              <line
                className={`vec-line ${paneId === 't1' ? 't1' : 't2'}`}
                x1={displayPoints.rp1.x} y1={displayPoints.rp1.y}
                x2={displayPoints.rp2.x} y2={displayPoints.rp2.y}
              />
              <circle cx={displayPoints.rp2.x} cy={displayPoints.rp2.y} r="2.5"
                fill={paneId === 't1' ? 'var(--warn)' : 'var(--accent)'} opacity="0.85" />
            </g>
          )}

          {placementGuide && (
            <g className="placement-guide">
              <path d={placementArcPath(placementGuide)} />
              <text
                className="point-label placement-guide-label"
                x={placementGuide.midpoint.x + 14}
                y={placementGuide.midpoint.y - 14}
              >
                {placementGuide.label}
              </text>
            </g>
          )}

          {/* ROIs */}
          {displayPoints.rp1 && roiPx.rp1 && (
            <g>
              <rect className="roi-fill rp1"
                x={displayPoints.rp1.x - roiPx.rp1.w / 2}
                y={displayPoints.rp1.y - roiPx.rp1.h / 2}
                width={roiPx.rp1.w} height={roiPx.rp1.h} />
              <rect className="roi-rect rp1"
                x={displayPoints.rp1.x - roiPx.rp1.w / 2}
                y={displayPoints.rp1.y - roiPx.rp1.h / 2}
                width={roiPx.rp1.w} height={roiPx.rp1.h} />
              <text className="point-label"
                x={displayPoints.rp1.x + roiPx.rp1.w / 2 + 10}
                y={displayPoints.rp1.y + roiPx.rp1.h / 2 + 16}>
                ROI₁ · {Math.round(roi.rp1.w)}×{Math.round(roi.rp1.h)}mm
              </text>
            </g>
          )}
          {displayPoints.rp2 && roiPx.rp2 && (
            <g>
              <rect className="roi-fill rp2"
                x={displayPoints.rp2.x - roiPx.rp2.w / 2}
                y={displayPoints.rp2.y - roiPx.rp2.h / 2}
                width={roiPx.rp2.w} height={roiPx.rp2.h} />
              <rect className="roi-rect rp2"
                x={displayPoints.rp2.x - roiPx.rp2.w / 2}
                y={displayPoints.rp2.y - roiPx.rp2.h / 2}
                width={roiPx.rp2.w} height={roiPx.rp2.h} />
              <text className="point-label"
                x={displayPoints.rp2.x + roiPx.rp2.w / 2 + 10}
                y={displayPoints.rp2.y + roiPx.rp2.h / 2 + 16}>
                ROI₂ · {Math.round(roi.rp2.w)}×{Math.round(roi.rp2.h)}mm
              </text>
            </g>
          )}

          {/* placed points */}
          {(['rp1', 'rp2'] as const).map(k => displayPoints[k] && (
            <g key={k} className={`crosshair ${k}`}>
              <line x1={displayPoints[k].x - 20} y1={displayPoints[k].y} x2={displayPoints[k].x - 6} y2={displayPoints[k].y} />
              <line x1={displayPoints[k].x + 6} y1={displayPoints[k].y} x2={displayPoints[k].x + 20} y2={displayPoints[k].y} />
              <line x1={displayPoints[k].x} y1={displayPoints[k].y - 20} x2={displayPoints[k].x} y2={displayPoints[k].y - 6} />
              <line x1={displayPoints[k].x} y1={displayPoints[k].y + 6} x2={displayPoints[k].x} y2={displayPoints[k].y + 20} />
              <circle className={`crosshair-ring ${k}`} cx={displayPoints[k].x} cy={displayPoints[k].y} r={markerRadius(roi[k], pxPerMm, 9)} />
              <circle className={`crosshair-dot ${k}`} cx={displayPoints[k].x} cy={displayPoints[k].y} r={markerRadius(roi[k], pxPerMm, 2.5)} />
              <text className="point-label"
                x={displayPoints[k].x + 14}
                y={displayPoints[k].y - 14}>
                {k === 'rp1' ? `RP1${paneId === 't1' ? 'B1' : 'B2'}` : `RP2${paneId === 't1' ? 'B1' : 'B2'}`}
              </text>
            </g>
          ))}

          {/* live hover crosshair while placing */}
          {active && pendingPoint && hover && (
            <g>
              <line x1={hover.x} y1={0} x2={hover.x} y2={frameHeight}
                stroke={pendingPoint.key === 'rp1' ? 'var(--rp1)' : 'var(--rp2)'}
                className="live-placement-guide" />
              <line x1={0} y1={hover.y} x2={frameWidth} y2={hover.y}
                stroke={pendingPoint.key === 'rp1' ? 'var(--rp1)' : 'var(--rp2)'}
                className="live-placement-guide" />
            </g>
          )}
        </svg>}

        {/* Loupe */}
        {imgSrc && showLoupe && frameRect.w > 0 && (
          <Loupe
            imgSrc={imgSrc}
            frameRect={frameRect}
            framePoint={hover}
            color={pendingPoint.key === 'rp1' ? 'rp1' : 'rp2'}
            placementGuide={placementGuide}
            frameSize={{ width: frameWidth, height: frameHeight }}
            imageSize={{ width: imageWidth, height: imageHeight }}
            matrix={affineMatrix ?? null}
          />
        )}
      </div>

      {imgSrc && <div className="pane-corner">{imageWidth} × {imageHeight} px</div>}
    </div>
  );
}
