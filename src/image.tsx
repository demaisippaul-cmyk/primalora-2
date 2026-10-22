import type { ComponentProps } from "react";

// The widths a generated picture offers as `?w=` addresses; the original answers where the site has no copy.
const generatedImageWidths = [320, 640, 960, 1280] as const;

// A picture Foundable generated for the site, named by its own SHA-256, at the address its pages use. This copies
// isGeneratedImagePath in Build's runner/source-bundle.mjs (server/src/build/), which an app cannot import: keep the
// two in step.
const generatedPicture = /^\/generated-assets\/[0-9a-f]{64}\.(?:webp|png)$/;

// The width and height attributes reserve a picture's shape and never stretch it: any page rule that sizes a picture
// wins over this one, whose specificity is zero. React writes it into the head once, however many pictures render.
const shapeRule = ":where(img[data-image]){height:auto}";

type ImageProps = Omit<
  ComponentProps<"img">,
  "src" | "alt" | "width" | "height" | "srcSet" | "loading" | "decoding" | "fetchPriority"
> & {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** The picture the first screen shows: fetched at once at high priority, and the one picture React preloads. */
  priority?: boolean;
};

/**
 * A picture, with next/image's props: alt, width and height are required, and every picture but the one marked
 * `priority` loads lazily and decodes off the main thread. A generated picture also offers its narrower widths.
 */
export function Image({ src, alt, width, height, priority = false, sizes, ...img }: ImageProps) {
  const widths = generatedPicture.test(src) ? generatedImageWidths.filter((candidate) => candidate < width) : [];
  const srcSet = widths.length
    ? [...widths.map((candidate) => `${src}?w=${candidate} ${candidate}w`), `${src} ${width}w`].join(", ")
    : undefined;
  return (
    <>
      <style href="image" precedence="image">
        {shapeRule}
      </style>
      <img
        {...img}
        data-image=""
        src={src}
        alt={alt}
        width={width}
        height={height}
        srcSet={srcSet}
        sizes={srcSet ? (sizes ?? (priority ? "100vw" : "auto, 100vw")) : sizes}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? undefined : "async"}
        fetchPriority={priority ? "high" : undefined}
      />
    </>
  );
}
