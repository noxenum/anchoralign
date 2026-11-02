import { affineToCssTransform, placementArcPath } from '@/lib/geometry';
import type { Affine6, ImageSize, LandmarkKey, PlacementArcGuide, Point } from '@/types';

const LOUPE_SIZE = 144;
const ZOOM = 3.5;

type LoupeProps = {
  imgSrc: string;
  frameRect: { w: number; h: number };
  // Cursor position in frame coordinates.
  framePoint: Point;
  color: LandmarkKey;
  placementGuide?: PlacementArcGuide | null;
  frameSize: ImageSize;
  imageSize: ImageSize;
  // Native image pixels → frame, as for the pane's image.
  matrix: Affine6 | null;
};

// Magnified view around the cursor while placing a landmark.
export function Loupe({ imgSrc, frameRect, framePoint, color, placementGuide, frameSize, imageSize, matrix }: LoupeProps) {
  const scaleX = (frameRect.w / frameSize.width) * ZOOM;
  const scaleY = (frameRect.h / frameSize.height) * ZOOM;
  const visibleW = LOUPE_SIZE / scaleX;
  const visibleH = LOUPE_SIZE / scaleY;

  return (
    <div
      className="loupe"
      style={{ right: 14, top: 38, width: LOUPE_SIZE, height: LOUPE_SIZE, position: 'absolute' }}
    >
      <img
        src={imgSrc}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: LOUPE_SIZE / 2 - framePoint.x * scaleX,
          top: LOUPE_SIZE / 2 - framePoint.y * scaleY,
          width: imageSize.width * scaleX,
          height: imageSize.height * scaleY,
          maxWidth: 'none',
          transform: matrix ? affineToCssTransform(matrix, scaleX, scaleY) : 'none',
          transformOrigin: '0 0',
        }}
      />
      {placementGuide && (
        <svg
          viewBox={[framePoint.x - visibleW / 2, framePoint.y - visibleH / 2, visibleW, visibleH].join(' ')}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          <g className="placement-guide">
            <path d={placementArcPath(placementGuide)} />
          </g>
        </svg>
      )}
      <div className="crosslines" style={{ position: 'absolute', inset: 0 }} />
      <div
        style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 16, height: 16, marginLeft: -8, marginTop: -8,
          border: `1.75px solid var(--${color})`,
          borderRadius: '50%',
        }}
      />
      <div className="loupe-label">
        {framePoint.x.toFixed(0)}, {framePoint.y.toFixed(0)}
      </div>
    </div>
  );
}
