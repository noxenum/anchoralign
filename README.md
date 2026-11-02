<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-dark.png">
    <img src=".github/assets/logo-light.png" alt="anchoralign" width="248">
  </picture>
</p>

<p align="center">
  <b>Structural superimposition of lateral cephalograms, right in your browser.</b><br>
  Cranial base, mandible and maxilla. No upload, no installation.
</p>

<p align="center">
  <img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-7c6cf2">
  <img alt="License: PolyForm Noncommercial" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial-4b5563">
  <img alt="Runs locally in the browser" src="https://img.shields.io/badge/runs-100%25%20in%20your%20browser-2f9e6e">
  <img alt="Research use only" src="https://img.shields.io/badge/use-research%20%26%20education%20only-c9861a">
</p>

<p align="center">
  <a href="https://anchoralign.org">Demo</a> (coming soon) ·
  <a href="#getting-started">Getting started</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#license">License</a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/screenshot-dark.webp">
  <img src=".github/assets/screenshot-light.webp" alt="anchoralign after all three superimpositions: the workflow with ten reference points on the left, the cranial-base overlay in the middle and the results of cranial base, mandible and maxilla on the right.">
</picture>
<p align="center"><sub>Shown with a synthetic phantom image. No patient data.</sub></p>

> [!IMPORTANT]
> **Research and education use only. Not a medical device.**
> anchoralign must not be used for diagnosis, treatment planning or any other
> clinical decision about patients. See [NOTICE.md](NOTICE.md).

## Why anchoralign

anchoralign aligns two lateral cephalograms of the same patient, for example
before and after treatment, so that growth and treatment changes become
visible. It follows the structural method in three standard superimpositions:
the cranial base, then the mandible and the maxilla on the cranial-base aligned
image. For each one you mark reference points on both images; anchoralign
pre-aligns the images and refines the superimposition automatically by matching
the image structures around those points.

<table>
  <tr>
    <td width="33%" valign="top">
      <b>Three superimpositions, one workflow</b><br>
      Ten clicks in total. Mandible and maxilla are superimposed on the
      cranial-base aligned image, with no export and re-import in between.
    </td>
    <td width="33%" valign="top">
      <b>Automatic refinement</b><br>
      Normalized cross-correlation on regions of interest around the
      reference points, with subpixel rotation and translation search.
    </td>
    <td width="33%" valign="top">
      <b>Private by design</b><br>
      Radiographs are processed entirely on your device. No backend, no
      upload, no tracking, no third-party requests.
    </td>
  </tr>
</table>

<details>
<summary><b>All features</b></summary>

**Workflow**

- Three-stage mode: cranial base (Walker's point, cribriform plate), mandible
  (cortical chin, mandibular canal) and maxilla (zygomatic process, a single
  reference point)
- Mandible and maxilla results are relative to the cranial-base superimposition
- Standard settings per superimposition, adjustable for the session
- Each alignment starts automatically shortly after its last point, with time
  to correct a point first
- Single mode runs any one superimposition on its own

**Alignment**

- Landmark-based pre-alignment from the reference points of each image
- Refinement by normalized cross-correlation (NCC) on regions of interest
  around both reference points
- Two rotation strategies: a joint ring-segment search about RP1 (default), or
  rotation about the moving RP2
- Grayscale or combined grayscale + edge scoring, CLAHE contrast enhancement
  (on by default)
- Option to keep the pre-alignment only, before or after refinement

**Comparison**

- Five comparison modes: side by side, color tint, opacity blend, difference
  and strobe (alternates T1 and the aligned T2)
- Landmarks and ROIs can be hidden for an unobstructed view

**Results and transparency**

- Summary of all superimpositions: rotation, RP1B2 translation, score curve and
  alignment score
- Per-ROI grayscale and edge NCC, residuals and displacement readings in mm
- Full iteration log with accepted and rejected steps, convergence status and
  a visual ROI history

**Calibration and export**

- Pixel scale read from image metadata (JPEG EXIF/JFIF, PNG `pHYs`, WebP EXIF)
  or entered in px/mm or dpi, with a warning when the two images disagree
- Export the aligned T2 of each superimposition as a PNG in T1's frame of
  reference, using the original pixels and keeping the pixel scale
- Export all results as CSV, including the settings used

**Interface**

- Light and dark theme; the image area stays dark for reading radiographs
- Explanations on hover, keyboard support throughout

</details>

## How it works

1. **Place landmarks.** Mark the reference points of the current
   superimposition on the first image (T1) and on the second image (T2).
2. **Pre-align.** T2 is rotated so its RP1→RP2 line matches T1's, then shifted
   so both RP1 points coincide. With a single reference point (maxilla) only
   the shift applies.
3. **Refine.** Each cycle searches a small rotation and translation, by
   default jointly as a ring segment about RP1, and keeps a step only if it
   improves its matching score by more than 0.0001. The loop stops when no step
   is accepted or the maximum number of cycles is reached.
4. **Continue.** In three-stage mode, repeat for the mandible and the maxilla
   on T2 as aligned on the cranial base.
5. **Compare and export.** Inspect each result in any comparison mode, review
   the summary and export the results and aligned images.

## Privacy

Your images never leave your browser. Radiographs are opened as local files
and processed entirely on your device: anchoralign has no backend, no upload,
no API and no tracking. The server only delivers the static app files, fonts
included, so the app makes no third-party requests. Display preferences
(theme, comparison mode, calibration unit, workflow mode) are stored in your
browser's `localStorage`; images, landmarks and results are not stored.

## Getting started

Requirements: Node.js 22.12 or newer.

```bash
npm install
npm run dev       # development server on http://localhost:5173
npm test          # run the test suite
npm run build     # type-check and build into dist/
```

<details>
<summary><b>Project structure</b></summary>

```text
src/
  App.tsx          page layout; wires the workspace state to the components
  components/      UI, one component per file, grouped by screen area
  hooks/           React state and effects; useWorkspace composes the others
  lib/             pure functions without React: stage definitions, the
                   workflow reducer, geometry, metadata, exports
  engine/          OpenCV worker and its typed client
  constants.ts     comparison modes, search limits, auto-start delay
  types.ts         shared types
```

Tests sit next to the code they cover (`*.test.ts`). Imports use the `@/`
alias for `src/`.

</details>

## Deployment

anchoralign is a static site. `npm run build` writes everything to `dist/`,
which any static web server can host; no backend is needed. If you set a
Content Security Policy, it must allow `'unsafe-eval'` and
`'wasm-unsafe-eval'` for scripts: the OpenCV.js runtime is evaluated in the
worker and compiles WebAssembly.

## Tech stack

TypeScript 7 · React 19 · Vite 8 · OpenCV.js 5.0 (WebAssembly, in a Web
Worker) · Canvas 2D / OffscreenCanvas · Vitest 5

## License

anchoralign is source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md). It is free to use, modify
and share for personal use, research, education and by noncommercial
organizations.

Commercial use, including integration into commercial products, requires a
separate license. Contact [licensing@anchoralign.org](mailto:licensing@anchoralign.org).

Third-party components and their licenses are listed in [NOTICE.md](NOTICE.md).

## Contributing

Bug reports and suggestions are welcome via GitHub Issues. We do not accept
external pull requests at the moment; see [CONTRIBUTING.md](CONTRIBUTING.md).
Please never attach patient images or other health data to issues.

## Credits

Developed by [Noxenum GmbH](https://noxenum.io) in collaboration with
Dr. med. dent. Jan Danz.
