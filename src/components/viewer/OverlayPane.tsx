import { useRef, type CSSProperties } from 'react';
import { useFittedFrame } from '@/hooks/useFittedFrame';
import { affineToCssTransform, applyAffine, markerRadius } from '@/lib/geometry';
import type { OverlayMode } from '@/lib/settings';
import type { Affine6, ImagePair, ImageSize, LandmarkDraft, Point, RoiConfig } from '@/types';
import { FALLBACK_IMAGE_SIZE } from './CephPane';

type OverlayPaneProps = {
  mode: Exclude<OverlayMode, 'side'>;
  points: LandmarkDraft;
  roi: RoiConfig;
  // Only one reference point per image: RP2 coincides with RP1 and is not drawn.
  singlePoint: boolean;
  // Native T1 → alignment frame (null: T1 as it is) and that frame's size.
  t1Transform: Affine6 | null;
  frameSize: ImageSize;
  t2Transform: Affine6 | null;
  showAnnotations: boolean;
  strobeFrame: 't1' | 't2';
  opacity: number;
  images: ImagePair;
  pxPerMm: number;
};

// T1 with the aligned T2 on top, combined according to the overlay mode.
export function OverlayPane({ mode, points: nativePoints, roi, singlePoint, t1Transform, frameSize, t2Transform, showAnnotations, strobeFrame, opacity, images, pxPerMm }: OverlayPaneProps) {
  // The frame is T1 at the alignment scale; T1 fills it.
  const { width: t1Width, height: t1Height } = frameSize;
  const t2Width = images.t2.width ?? FALLBACK_IMAGE_SIZE.width;
  const t2Height = images.t2.height ?? FALLBACK_IMAGE_SIZE.height;
  const paneRef = useRef<HTMLDivElement>(null);
  const frameRect = useFittedFrame(paneRef, t1Width / t1Height);

  const t1At = (p: Point | null) => (p && t1Transform ? applyAffine(t1Transform, p) : p);
  const points = { t1: { rp1: t1At(nativePoints.t1.rp1), rp2: t1At(nativePoints.t1.rp2) }, t2: nativePoints.t2 };
  const moved = (p: Point | null) => (p && t2Transform ? applyAffine(t2Transform, p) : p);
  const rp1B2After = moved(points.t2.rp1);
  const rp2B2After = singlePoint ? null : moved(points.t2.rp2);

  const roi1T1 = points.t1.rp1 ? { x: points.t1.rp1.x, y: points.t1.rp1.y, w: roi.rp1.w * pxPerMm, h: roi.rp1.h * pxPerMm } : null;
  const roi2T1 = points.t1.rp2 && !singlePoint ? { x: points.t1.rp2.x, y: points.t1.rp2.y, w: roi.rp2.w * pxPerMm, h: roi.rp2.h * pxPerMm } : null;
  const markerRadii = { rp1: markerRadius(roi.rp1, pxPerMm), rp2: markerRadius(roi.rp2, pxPerMm) };
  const scaleX = frameRect.w / t1Width;
  const scaleY = frameRect.h / t1Height;

  const t2Style: CSSProperties = { transform: affineToCssTransform(t2Transform, scaleX, scaleY), transformOrigin: '0 0' };
  const t1Style: CSSProperties = {};
  if (mode === 'tint') {
    t1Style.filter = 'sepia(1) hue-rotate(-25deg) saturate(2.2) brightness(1.05)';
    t2Style.filter = 'sepia(1) hue-rotate(160deg) saturate(2.5) brightness(1.0)';
    t2Style.mixBlendMode = 'screen';
  } else if (mode === 'opacity') {
    t2Style.opacity = opacity;
  } else if (mode === 'difference') {
    t2Style.mixBlendMode = 'difference';
  } else if (mode === 'strobe') {
    t1Style.visibility = strobeFrame === 't1' ? 'visible' : 'hidden';
    t2Style.visibility = strobeFrame === 't2' ? 'visible' : 'hidden';
  }

  return (
    <div className="canvas-pane" ref={paneRef} style={{ display:'flex', alignItems:'center', justifyContent:'center', gridColumn: '1 / -1' }}>
      <div className="pane-label">
        <span className="active-mark" />
        <span className="tag">T1 + T2</span>
      </div>

      <div
        className="img-frame"
        style={{
          position: 'relative',
          width: frameRect.w ? `${frameRect.w}px` : '0',
          height: frameRect.h ? `${frameRect.h}px` : '0',
          overflow: 'hidden',
          background: 'oklch(0 0 0)',
        }}
      >
        <img
          src={images.t1.src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block', userSelect: 'none', pointerEvents: 'none',
            ...t1Style,
          }}
        />
        <img
          src={images.t2.src}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${t2Width * scaleX}px`,
            height: `${t2Height * scaleY}px`,
            display: 'block', userSelect: 'none', pointerEvents: 'none',
            transition: 'none',
            ...t2Style,
          }}
        />

        {showAnnotations && <svg viewBox={`0 0 ${t1Width} ${t1Height}`} preserveAspectRatio="none"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            pointerEvents: 'none', overflow: 'visible',
          }}
        >
          {roi1T1 && (
            <rect className="roi-rect fixed-roi rp1" x={roi1T1.x - roi1T1.w/2} y={roi1T1.y - roi1T1.h/2} width={roi1T1.w} height={roi1T1.h} />
          )}
          {roi2T1 && (
            <rect className="roi-rect fixed-roi rp2" x={roi2T1.x - roi2T1.w/2} y={roi2T1.y - roi2T1.h/2} width={roi2T1.w} height={roi2T1.h} />
          )}
          {rp1B2After && roi1T1 && (
            <rect className="moving-roi rp1"
              x={rp1B2After.x - roi1T1.w/2} y={rp1B2After.y - roi1T1.h/2}
              width={roi1T1.w} height={roi1T1.h} />
          )}
          {rp2B2After && roi2T1 && (
            <rect className="moving-roi rp2"
              x={rp2B2After.x - roi2T1.w/2} y={rp2B2After.y - roi2T1.h/2}
              width={roi2T1.w} height={roi2T1.h} />
          )}

          {(singlePoint ? ['rp1'] as const : ['rp1', 'rp2'] as const).map(k => points.t1[k] && (
            <g key={`t1-${k}`} className={`crosshair ${k}`}>
              <circle className={`crosshair-ring ${k}`} cx={points.t1[k].x} cy={points.t1[k].y} r={markerRadius(roi[k], pxPerMm, 9)} />
              <circle className={`crosshair-dot ${k}`} cx={points.t1[k].x} cy={points.t1[k].y} r={markerRadius(roi[k], pxPerMm, 2.5)} />
              <text className="point-label" x={points.t1[k].x + 14} y={points.t1[k].y - 14}>
                {k === 'rp1' ? 'RP1B1' : 'RP2B1'}
              </text>
            </g>
          ))}
          {rp1B2After && (
            <g style={{pointerEvents:'none'}}>
              <circle cx={rp1B2After.x} cy={rp1B2After.y} r={markerRadii.rp1}
                className="transformed-marker rp1" />
              <text className="point-label" x={rp1B2After.x + markerRadii.rp1 + 8} y={rp1B2After.y + markerRadii.rp1 + 8} style={{fill:'var(--rp1)'}}>RP1B2′ marker</text>
            </g>
          )}
          {rp2B2After && (
            <g style={{pointerEvents:'none'}}>
              <circle cx={rp2B2After.x} cy={rp2B2After.y} r={markerRadii.rp2}
                className="transformed-marker rp2" />
              <text className="point-label" x={rp2B2After.x + markerRadii.rp2 + 8} y={rp2B2After.y + markerRadii.rp2 + 8} style={{fill:'var(--rp2)'}}>RP2B2′ marker</text>
            </g>
          )}
          {points.t1.rp1 && points.t1.rp2 && !singlePoint && (
            <line className="vec-line t1" x1={points.t1.rp1.x} y1={points.t1.rp1.y} x2={points.t1.rp2.x} y2={points.t1.rp2.y} />
          )}
        </svg>}
      </div>

      <div className="pane-corner">{t1Width} × {t1Height} px · {pxPerMm.toFixed(2)} px/mm</div>
    </div>
  );
}
