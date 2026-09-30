"use client";

import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { parse as parseFont } from "opentype.js";

type SignatureGlyph = {
  advanceWidth?: number;
  getPath: (
    x: number,
    y: number,
    fontSize: number,
  ) => {
    toPathData: (decimalPlaces?: number) => string;
  };
};

type SignatureFont = {
  unitsPerEm: number;
  charToGlyph: (char: string) => SignatureGlyph;
};

const SVG_HEIGHT = 100;
const PATH_DELAY_STEP = 0.2;
const OPACITY_DELAY_OFFSET = 0.01;
const fontCache = new Map<string, SignatureFont>();

function getFontCacheKey(path: string): string {
  try {
    return new URL(path, window.location.origin).href;
  } catch {
    return path;
  }
}

function getPathTransition(index: number, duration: number, delay: number) {
  const pathDelay = delay + index * PATH_DELAY_STEP;

  return {
    pathLength: {
      delay: pathDelay,
      duration,
      ease: "easeInOut" as const,
    },
    opacity: {
      delay: pathDelay + OPACITY_DELAY_OFFSET,
      duration: 0.01,
    },
  };
}

async function loadFontFromPaths(fontPaths: string[]): Promise<SignatureFont> {
  for (const path of fontPaths) {
    try {
      const cacheKey = getFontCacheKey(path);
      const cachedFont = fontCache.get(cacheKey);

      if (cachedFont) return cachedFont;

      const response = await fetch(path);
      if (!response.ok) continue;

      const fontBuffer = await response.arrayBuffer();
      const font = parseFont(fontBuffer) as SignatureFont;
      fontCache.set(cacheKey, font);
      return font;
    } catch {
      // Try the next configured font path.
    }
  }

  throw new Error(`Font could not be loaded from: ${fontPaths.join(", ")}`);
}

async function buildSignaturePaths({
  text,
  fontSize,
  baseline,
  horizontalPadding,
}: {
  text: string;
  fontSize: number;
  baseline: number;
  horizontalPadding: number;
}): Promise<{ paths: string[]; width: number }> {
  const font = await loadFontFromPaths(["/LastoriaBoldRegular.otf"]);
  let x = horizontalPadding;
  const paths: string[] = [];

  for (const char of text) {
    const glyph = font.charToGlyph(char);
    paths.push(glyph.getPath(x, baseline, fontSize).toPathData(3));
    x += (glyph.advanceWidth ?? font.unitsPerEm) * (fontSize / font.unitsPerEm);
  }

  return { paths, width: x + horizontalPadding };
}

function renderMotionPaths({
  paths,
  stroke,
  strokeWidth,
  strokeLinecap,
  duration,
  delay,
}: {
  paths: string[];
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "round" | "butt";
  duration: number;
  delay: number;
}) {
  return paths.map((path, index) => (
    <motion.path
      key={index}
      d={path}
      stroke={stroke}
      strokeWidth={strokeWidth}
      fill="none"
      variants={PATH_VARIANTS}
      transition={getPathTransition(index, duration, delay)}
      vectorEffect="non-scaling-stroke"
      strokeLinecap={strokeLinecap}
      strokeLinejoin="round"
    />
  ));
}

const PATH_VARIANTS = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: { pathLength: 1, opacity: 1 },
};

interface SignatureProps {
  text?: string;
  color?: string;
  fontSize?: number;
  duration?: number;
  delay?: number;
  className?: string;
  inView?: boolean;
  once?: boolean;
}

export function Signature({
  text = "Signature",
  color = "#000",
  fontSize = 14,
  duration = 1.5,
  delay = 0,
  className,
  inView = false,
  once = true,
}: SignatureProps) {
  const [paths, setPaths] = useState<string[]>([]);
  const [width, setWidth] = useState(300);
  const horizontalPadding = fontSize * 0.1;
  const topMargin = Math.max(5, (SVG_HEIGHT - fontSize) / 2);
  const baseline = Math.min(SVG_HEIGHT - 5, topMargin + fontSize);
  const maskId = `signature-reveal-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    let cancelled = false;

    async function loadSignaturePaths() {
      try {
        const result = await buildSignaturePaths({ text, fontSize, baseline, horizontalPadding });
        if (cancelled) return;
        setPaths(result.paths);
        setWidth(result.width);
      } catch {
        if (cancelled) return;
        setPaths([]);
        setWidth(text.length * fontSize * 0.6);
      }
    }

    void loadSignaturePaths();
    return () => { cancelled = true; };
  }, [text, fontSize, baseline, horizontalPadding]);

  return (
    <motion.svg
      key={paths.length}
      width={width}
      height={SVG_HEIGHT}
      viewBox={`0 0 ${width} ${SVG_HEIGHT}`}
      fill="none"
      className={className}
      initial="hidden"
      whileInView={inView ? "visible" : undefined}
      animate={inView ? undefined : "visible"}
      viewport={{ once }}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse">
          {renderMotionPaths({ paths, stroke: "white", strokeWidth: fontSize * 0.22, strokeLinecap: "round", duration, delay })}
        </mask>
      </defs>
      {renderMotionPaths({ paths, stroke: color, strokeWidth: 2, strokeLinecap: "butt", duration, delay })}
      <g mask={`url(#${maskId})`}>
        {paths.map((path, index) => <path key={index} d={path} fill={color} />)}
      </g>
    </motion.svg>
  );
}
