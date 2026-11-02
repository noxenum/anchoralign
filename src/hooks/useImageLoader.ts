import { useEffect, useRef, useState } from 'react';
import type { CephEngine } from '@/engine/engineClient';
import type { ImageResolution } from '@/lib/imageResolution';
import type { ImageKey, ImagePair } from '@/types';

const EMPTY_IMAGES: ImagePair = {
  t1: { src: null, claheSrc: null, name: 'No T1 image loaded', width: null, height: null, resolution: null },
  t2: { src: null, claheSrc: null, name: 'No T2 image loaded', width: null, height: null, resolution: null },
};

// Holds the two uploaded images as object URLs. Once both are present the
// worker decodes them and reports their native size and CLAHE previews.
export function useImageLoader(engine: CephEngine | null) {
  const [images, setImages] = useState(EMPTY_IMAGES);
  const [claheReady, setClaheReady] = useState(false);
  // Settles when the worker holds the current images.
  const loaded = useRef<Promise<unknown> | null>(null);
  const objectUrls = useRef(new Set<string>());

  const createObjectUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    objectUrls.current.add(url);
    return url;
  };
  const revokeObjectUrl = (url: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  };

  useEffect(() => {
    const urls = objectUrls.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const hasImages = !!(images.t1.src && images.t2.src);
  const hasGeometry = !!(images.t1.width && images.t1.height && images.t2.width && images.t2.height);

  useEffect(() => {
    if (!engine || !hasImages) {
      loaded.current = null;
      return;
    }
    let stale = false;
    loaded.current = engine.loadImages(images.t1.src, images.t2.src).then((payload) => {
      if (stale) return payload;
      const t1ClaheUrl = createObjectUrl(payload.claheT1);
      const t2ClaheUrl = createObjectUrl(payload.claheT2);
      setImages((prev) => {
        revokeObjectUrl(prev.t1.claheSrc);
        revokeObjectUrl(prev.t2.claheSrc);
        return {
          t1: { ...prev.t1, ...payload.t1, claheSrc: t1ClaheUrl },
          t2: { ...prev.t2, ...payload.t2, claheSrc: t2ClaheUrl },
        };
      });
      setClaheReady(true);
      return payload;
    }).catch((err) => {
      console.error('Failed to load NCC engine images', err);
      throw err;
    });
    return () => { stale = true; };
  }, [engine, images.t1.src, images.t2.src, hasImages]);

  const setImage = (key: ImageKey, file: File, resolution: ImageResolution | null) => {
    const src = createObjectUrl(file);
    setImages((prev) => {
      revokeObjectUrl(prev[key].src);
      revokeObjectUrl(prev[key].claheSrc);
      return {
        ...prev,
        [key]: { src, claheSrc: null, name: file.name, width: null, height: null, resolution },
      };
    });
    setClaheReady(false);
  };

  const clearImage = (key: ImageKey) => {
    setImages((prev) => {
      revokeObjectUrl(prev[key].src);
      revokeObjectUrl(prev[key].claheSrc);
      // The CLAHE preview of the other image belongs to the old pair as well.
      const other = key === 't1' ? 't2' : 't1';
      revokeObjectUrl(prev[other].claheSrc);
      return { ...prev, [key]: EMPTY_IMAGES[key], [other]: { ...prev[other], claheSrc: null } };
    });
    setClaheReady(false);
  };

  return { images, claheReady, hasImages, hasGeometry, loaded, setImage, clearImage };
}
