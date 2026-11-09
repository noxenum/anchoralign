import type { ReactNode } from 'react';
import type { OverlayMode } from '@/lib/settings';
import type { LandmarkMeta } from '@/lib/stages';
import type { Affine6, ImageKey, ImagePair, ImageSize, LandmarkDraft, LandmarkKey, PlacementArcGuide, Point, RoiConfig } from '@/types';
import { CephPane } from './CephPane';
import { OverlayPane } from './OverlayPane';

type ViewerProps = {
  images: ImagePair;
  // Landmarks in native image pixels.
  points: LandmarkDraft;
  roi: RoiConfig;
  // Scale of the alignment frame, which both panes show.
  pxPerMm: number;
  // Native T1 → alignment frame, or null when T1 is shown as it is.
  t1Transform: Affine6 | null;
  t1FrameSize: ImageSize;
  // Size of T2's frame when t2Transform is set.
  t2FrameSize: ImageSize;
  // Calibration shown in the corner of each pane.
  paneNotes: Record<ImageKey, string>;
  singlePoint: boolean;
  isOverlayPhase: boolean;
  overlayMode: OverlayMode;
  // Native T2 → its displayed frame, or null to show T2 as it is.
  t2Transform: Affine6 | null;
  showAnnotations: boolean;
  strobeFrame: 't1' | 't2';
  opacity: number;
  // Landmark that a click places, or null when not placing.
  placing: LandmarkMeta | null;
  // In T2's displayed frame.
  placementGuide: PlacementArcGuide | null;
  onPlace: (image: ImageKey, key: LandmarkKey, point: Point) => void;
  onFileDrop: (image: ImageKey, file: File) => void;
  // Prompts drawn over the image area.
  children?: ReactNode;
};

// Two side-by-side panes while placing landmarks, the overlay once aligned.
export function Viewer({
  images, points, roi, pxPerMm, t1Transform, t1FrameSize, t2FrameSize, paneNotes, singlePoint, isOverlayPhase, overlayMode, t2Transform, showAnnotations,
  strobeFrame, opacity, placing, placementGuide, onPlace, onFileDrop, children,
}: ViewerProps) {
  const hasImages = !!(images.t1.src && images.t2.src);
  const showOverlay = isOverlayPhase && overlayMode !== 'side' && hasImages;

  const pane = (image: ImageKey) => {
    const active = placing?.image === image;
    const matrix = image === 't1' ? t1Transform : t2Transform;
    return (
      <CephPane
        showAnnotations={!isOverlayPhase || showAnnotations}
        paneId={image}
        imgSrc={images[image].src}
        label={image.toUpperCase()}
        dateStr={images[image].name}
        pxPerMm={pxPerMm}
        active={active}
        pendingPoint={active ? { key: placing.key } : null}
        points={points[image]}
        roi={roi}
        showVector={!!(points[image].rp1 && points[image].rp2)}
        singlePoint={singlePoint}
        affineMatrix={matrix}
        frameSize={matrix ? (image === 't1' ? t1FrameSize : t2FrameSize) : null}
        cornerNote={paneNotes[image]}
        onPlace={(key, point) => onPlace(image, key, point)}
        onFileDrop={(file) => onFileDrop(image, file)}
        placementGuide={image === 't2' ? placementGuide : null}
        imageSize={{ width: images[image].width, height: images[image].height }}
      />
    );
  };

  return (
    <div className={`canvas-stage ${isOverlayPhase && overlayMode !== 'side' ? '' : 'split'}`}>
      {showOverlay ? (
        <OverlayPane
          mode={overlayMode as Exclude<OverlayMode, 'side'>}
          points={points}
          roi={roi}
          singlePoint={singlePoint}
          t1Transform={t1Transform}
          frameSize={t1FrameSize}
          t2Transform={t2Transform}
          showAnnotations={showAnnotations}
          strobeFrame={strobeFrame}
          opacity={opacity}
          images={images}
          pxPerMm={pxPerMm}
        />
      ) : (
        <>
          {pane('t1')}
          {pane('t2')}
        </>
      )}
      {children}
    </div>
  );
}
