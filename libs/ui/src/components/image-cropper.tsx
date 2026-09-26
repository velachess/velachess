"use client";

import { useCallback, useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

import { cn } from "../lib/utils.ts";
import { Slider } from "./slider.tsx";

/**
 * Pick a square region of an image and hand back the encoded result.
 *
 * Written here rather than vendored: the obvious registry component wraps
 * `react-image-crop`, which has no zoom, and its own encode step exports a
 * full-resolution PNG at quality 1.0 with smoothing off — multiple
 * megabytes from a phone photo, and aliased when scaled down.
 *
 * Presentation only. It holds crop state and reports the encoded blob
 * whenever the crop settles, so the consumer's own Save button just uses
 * the last blob it was handed. No copy lives here: every label arrives as
 * a prop, per libs/ui's boundary.
 */

/** A square avatar never needs more than this, and it is what keeps the
 * encoded result small enough to travel as base64 in a JSON body. */
const OUTPUT_SIZE = 512;

const ZOOM = { min: 1, max: 3, step: 0.05 } as const;

export interface ImageCropperProps {
  /** Object URL of the picked file. The caller owns revoking it. */
  src: string;
  /** Called with the encoded crop whenever it settles, including once on
   * first render — so a consumer that never touches the controls still has
   * something to save. */
  onCropped: (blob: Blob) => void;
  /** Largest acceptable encoded size. Quality steps down until the result
   * fits, because a hard ceiling downstream is better refused here. */
  maxBytes?: number;
  /** Accessible name for the zoom control — copy belongs to the consumer. */
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
   * Encodes are concurrent and take unequal time — the quality loop runs
   * once for a flat image and four times for a busy photograph — so a
   * drag that settles twice can resolve out of order and hand the parent
   * the earlier crop last. The person would then save a position they had
   * already moved away from.
   *
   * A counter is enough: only the newest request may report. Nothing to
   * cancel, because the work is CPU-bound and already started; the stale
   * answer is simply dropped.
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
 * Draw the chosen region into a fixed square and encode it.
 *
 * Smoothing on and `quality: "high"`, because the common case is scaling a
 * large photo down, where nearest-neighbour is visibly ragged. Quality
 * steps down rather than picking one number, so a busy photograph and a
 * flat illustration both land under the ceiling without either being
 * needlessly soft.
 *
 * WebP: smaller than JPEG at equal quality, supported everywhere this app
 * runs, and it is what the server's key extension declares.
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

  // Re-encoding through a canvas also drops every EXIF block, so camera
  // orientation and GPS never leave the browser.
  let blob = await encode(canvas, 0.85);
  for (const quality of [0.7, 0.55, 0.4]) {
    if (maxBytes === undefined || blob.size <= maxBytes) break;
    // Sequential on purpose: each encode runs only because the previous
    // one was too big, so Promise.all would do all four every time and
    // throw three away.
    // oxlint-disable-next-line eslint/no-await-in-loop
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
