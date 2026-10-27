import type { ImageLoaderProps } from "next/image";

const SMALL_IMAGE_WIDTH = 640;
const MEDIUM_IMAGE_WIDTH = 768;

const PRODUCT_IMAGE_VARIANTS = {
  "/product/game-analysis.webp": {
    small: "/product/game-analysis-640.webp",
    medium: "/product/game-analysis-768.webp",
  },
} as const;

function isProductImage(src: string): src is keyof typeof PRODUCT_IMAGE_VARIANTS {
  return Object.hasOwn(PRODUCT_IMAGE_VARIANTS, src);
}

export default function productImageLoader({ src, width }: ImageLoaderProps) {
  if (!isProductImage(src)) return src;
  const variants = PRODUCT_IMAGE_VARIANTS[src];
  if (width <= SMALL_IMAGE_WIDTH) return variants.small;
  if (width <= MEDIUM_IMAGE_WIDTH) return variants.medium;
  // Next probes the loader with the image's intrinsic width to confirm it
  // varies output by width; a bare `src` at that width looks unimplemented.
  return `${src}?w=${width}`;
}
