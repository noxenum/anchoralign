import type {
  Affine6,
  AlignmentResult,
  ImageSize,
  IterationEvent,
  LandmarkSet,
  PreAlignEvent,
  PreprocessMode,
  RoiConfig,
  RotationMode,
  ScoreMode,
} from '@/types';

export type AlignRequest = {
  scoreMode?: ScoreMode;
  rotationMode?: RotationMode;
  refinement?: boolean;
  points: LandmarkSet;
  roi: RoiConfig;
  pxPerMm: number;
  stepDeg: number;
  stepMm: number;
  rotRange: number;
  trRange: number;
  preprocessMode?: PreprocessMode;
  maxCycles?: number;
  // Maps native T2 pixels into the frame the T2 points are given in, e.g. the
  // cranial-base result for the mandibular step. Omitted for native T2.
  t2Base?: Affine6 | null;
};

export type AlignHandlers = {
  onIteration?: (event: IterationEvent) => void;
  onPreAlign?: (event: PreAlignEvent) => void;
};

export type LoadImagesResult = {
  t1: ImageSize;
  t2: ImageSize;
  // CLAHE-enhanced previews of both images as PNG.
  claheT1: Blob;
  claheT2: Blob;
};

// Main-thread facade for the OpenCV worker. Requests are expected one at a time.
export class CephEngine {
  private worker: Worker;
  private ready: Promise<void>;

  constructor() {
    this.worker = new Worker(new URL('./nccWorker.ts', import.meta.url), { type: 'module' });
    this.ready = this.request<void>(null, 'ready').catch((err) => {
      throw new Error(err?.message || 'OpenCV worker failed to initialize');
    });
  }

  async loadImages(t1Url: string, t2Url: string): Promise<LoadImagesResult> {
    await this.ready;
    return this.request({ type: 'loadImages', payload: { t1Url, t2Url } }, 'imagesLoaded');
  }

  async align(request: AlignRequest, handlers: AlignHandlers = {}): Promise<AlignmentResult> {
    await this.ready;
    return this.request({ type: 'align', payload: request }, 'done', (type, payload) => {
      if (type === 'preAlign') handlers.onPreAlign?.(payload);
      if (type === 'iteration') handlers.onIteration?.(payload);
    });
  }

  dispose(): void {
    this.worker.terminate();
  }

  // Posts a message (if any) and resolves with the payload of the first
  // `doneType` reply; other messages are passed to `onProgress`.
  private request<T>(
    message: { type: string; payload: unknown } | null,
    doneType: string,
    onProgress?: (type: string, payload: any) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.worker.removeEventListener('message', onMessage);
        this.worker.removeEventListener('error', onError);
      };
      const onMessage = (event: MessageEvent) => {
        const { type, payload } = event.data ?? {};
        if (type === doneType) {
          cleanup();
          resolve(payload);
        } else if (type === 'error') {
          cleanup();
          reject(new Error(payload?.message ?? `${message?.type ?? 'Worker'} failed`));
        } else {
          onProgress?.(type, payload);
        }
      };
      const onError = (event: ErrorEvent) => {
        cleanup();
        reject(new Error(event.message || 'Worker error'));
      };
      this.worker.addEventListener('message', onMessage);
      this.worker.addEventListener('error', onError);
      if (message) this.worker.postMessage(message);
    });
  }
}
