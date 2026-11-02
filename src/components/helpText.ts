import { ROT_RANGE_DEG, TR_RANGE_MM } from '@/constants';

// Explanations shown in tooltips.
export const HELP = {
  score: 'NCC is the correlation coefficient (−1 to 1); higher means a closer match. The alignment score is the mean of both fixed-frame ROI scores.',
  scoreGray: 'Only grayscale correlation is used for alignment. Edge correlation is shown for diagnosis only.',
  scoreBlend: 'The alignment score weights grayscale correlation 40% and edge correlation 60%.',
  rotationRing: `Rotation and translation are found together: for each angle about RP1 (±${ROT_RANGE_DEG}°), ROI₁ is re-matched within the translation limit, then ROI₂ at its fixed T1 position selects the angle. A step is accepted only when the overall fixed-frame score improves. Rotation sensitivity comes from the RP1–RP2 distance, not the ROI₂ size.`,
  rotationMoving: 'Rotation is accepted when moving-centre ROI₂ improves; translation is accepted when fixed-frame ROI₁ improves. The other ROI does not block a step.',
  roi: 'ROIs are anchored to their reference points and re-sampled at each iteration as the points move with the transform.',
  singlePoint: 'This superimposition uses one reference point per image, so ROI₁ and ROI₂ coincide.',
  steps: `Rotation is searched within ±${ROT_RANGE_DEG}°, translation within ${TR_RANGE_MM} mm in total. The loop stops early when no step improves its score by more than 0.0001.`,
  chained: 'Superimposed on T2 as aligned on the cranial base. Rotation and translation are relative to the cranial-base result.',
  translation: 'Two readings of translation: how far RP1B2 moved during alignment, and where RP1B1, transferred onto image 2 before alignment, was observed. They should agree within sub-mm; a divergence indicates a pre-alignment error.',
  historyRing: 'Ring segment: for each angle about RP1, ROI₁ sets the translation and fixed-frame ROI₂ selects the angle. A step is accepted when the overall fixed-frame score improves.',
  historyMoving: 'Rotation scores ROI₂ around the moving landmark; translation scores ROI₁ in the fixed T1 frame. Each step is accepted when its own objective improves; the other ROI is shown for information only.',
  clahe: 'Contrast-limited adaptive histogram equalisation. Enhances local contrast before matching.',
  preAlignment: 'Use the landmark-based pre-alignment as the result, without NCC refinement.',
  autoRun: 'Pick a reference point in the workflow to correct it before the alignment starts.',
};
