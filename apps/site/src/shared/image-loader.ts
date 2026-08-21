import type { ImageLoaderProps } from "next/image";

const SMALL_IMAGE_WIDTH = 640;
const MEDIUM_IMAGE_WIDTH = 768;

const PRODUCT_IMAGE_VARIANTS = {
  "/product/game-analysis.webp": {
    small: "/product/game-analysis-640.webp",
    medium: "/product/game-analysis-768.webp",
  },
  "/product/drill.webp": {
    small: "/product/drill-640.webp",
    medium: "/product/drill-768.webp",
  },
} as const;

export default function productImageLoader({ src, width }: ImageLoaderProps) {
  const variants = PRODUCT_IMAGE_VARIANTS[src as keyof typeof PRODUCT_IMAGE_VARIANTS];
  if (variants === undefined) return src;
  if (width <= SMALL_IMAGE_WIDTH) return variants.small;
  if (width <= MEDIUM_IMAGE_WIDTH) return variants.medium;
  return src;
}
