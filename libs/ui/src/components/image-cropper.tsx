"use client";

import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { cn } from "../lib/utils.ts";
import { Slider } from "./slider.tsx";

/**
 * Written here rather than vendored: the registry component wraps
 * `react-image-crop`, which has no zoom, and its encode step exports a
 * full-resolution PNG at quality 1.0 with smoothing off — megabytes from a
 * phone photo, and aliased when scaled down.
 */

/** Keeps the encoded result small enough to travel as base64 in a JSON
 * body. */
const OUTPUT_SIZE = 512;

const ZOOM = { min: 1, max: 3, step: 0.05 } as const;

export interface ImageCropperProps {
  /** Object URL of the picked file; the caller revokes it. */
  src: string;
  /** Fires once on first render too, so a consumer that never touches the
   * controls still has something to save. */
  onCropped: (blob: Blob) => void;
  /** Quality steps down until the result fits. */
  maxBytes?: number;
  /** Accessible name for the zoom control. */
  zoomLabel: string;
  className?: string;
}

export function ImageCropper({
  src,
  onCropped,
  maxBytes,
  zoomLabel,
  className,
}: ImageCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  // Annotated, or `as const` on ZOOM narrows the state to the literal 1.
  const [zoom, setZoom] = useState<number>(ZOOM.min);

  /**
   * Encodes take unequal time — the quality loop runs once for a flat image
   * and four times for a busy photograph — so two settled drags can resolve
   * out of order and save a position the person already moved away from.
   * Only the newest request may report; the work is CPU-bound and already
   * started, so there is nothing to cancel.
   */
  const latest = useRef(0);

  const handleCropComplete = useCallback(
    (_area: Area, pixels: Area) => {
      latest.current += 1;
      const request = latest.current;

      void cropToWebp(src, pixels, maxBytes).then((blob) => {
        if (request === latest.current) onCropped(blob);
      });
    },
    [src, maxBytes, onCropped],
  );

  return (
    <div className={cn("flex flex-col gap-4", className)} data-slot="image-cropper">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>

      <Slider
        aria-label={zoomLabel}
        min={ZOOM.min}
        max={ZOOM.max}
        step={ZOOM.step}
        value={zoom}
        onValueChange={(next) => setZoom(Array.isArray(next) ? next[0]! : next)}
      />
    </div>
  );
}

/**
 * Smoothing on and `quality: "high"` because the common case is scaling a
 * large photo down, where nearest-neighbour is visibly ragged. Quality
 * steps down rather than picking one number, so a busy photograph and a
 * flat illustration both land under the ceiling. WebP is what the server's
 * key extension declares.
 */
async function cropToWebp(src: string, pixels: Area, maxBytes?: number): Promise<Blob> {
  const image = await loadImage(src);

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas 2d context unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    pixels.x,
    pixels.y,
    pixels.width,
    pixels.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  // Re-encoding through a canvas drops every EXIF block, so camera
  // orientation and GPS never leave the browser.
  let blob = await encode(canvas, 0.85);
  for (const quality of [0.7, 0.55, 0.4]) {
    if (maxBytes === undefined || blob.size <= maxBytes) break;
    // oxlint-disable-next-line eslint/no-await-in-loop -- each encode runs only because the previous one was too big; Promise.all would run all four every time
    blob = await encode(canvas, quality);
  }

  return blob;
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("canvas encode failed"))),
      "image/webp",
      quality,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("could not decode image")));
    image.src = src;
  });
}
