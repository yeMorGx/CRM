"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "cn";

type Align = "left" | "center" | "right";

const defaultColors = ["#8d6869", "#5a8ea6", "#b9c96e", "#c7c571", "#cb706f", "#7e5e5f"];

interface GradientWaveTextProps {
  children?: React.ReactNode;
  align?: Align;
  className?: string;
  speed?: number;
  paused?: boolean;
  delay?: number;
  repeat?: boolean;
  inView?: boolean;
  once?: boolean;
  radial?: boolean;
  bottomOffset?: number;
  bandGap?: number;
  bandCount?: number;
  customColors?: string[];
  onClick?: (event: React.MouseEvent) => void;
  onMouseEnter?: (event: React.MouseEvent) => void;
  onMouseLeave?: (event: React.MouseEvent) => void;
  ariaLabel?: string;
}

export function GradientWaveText({
  children,
  align = "center",
  className,
  speed = 1,
  paused = false,
  delay = 0,
  repeat = false,
  inView = false,
  once = true,
  radial = true,
  bottomOffset = 20,
  bandGap = 4,
  bandCount = 8,
  customColors,
  onClick,
  onMouseEnter,
  onMouseLeave,
  ariaLabel,
}: GradientWaveTextProps) {
  const elementRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef(0);
  const progressRef = useRef(0);
  const cyclesDoneRef = useRef(0);
  const finishedRef = useRef(false);
  const startedRef = useRef(false);
  const startAtRef = useRef(0);
  const hasPlayedRef = useRef(false);
  const [isInView, setIsInView] = useState(!inView);
  const cycles = repeat ? 0 : 1;

  useEffect(() => {
    if (!inView) return;
    const node = elementRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          if (once && hasPlayedRef.current) return;
          setIsInView(true);
          hasPlayedRef.current = true;
        } else if (!once) {
          setIsInView(false);
        }
      });
    }, { threshold: 0.1 });

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, once]);

  const resolvedColors = useMemo(() => customColors?.length ? customColors : defaultColors, [customColors]);
  const stops = useMemo(() => {
    const values = ["var(--gradient-wave-base, rgb(29,29,31)) calc((var(--gi) + 0) * 1%)"];
    for (let index = 0; index < bandCount && index < resolvedColors.length * 2; index += 1) {
      const color = resolvedColors[index % resolvedColors.length];
      const offset = (index + 2) * bandGap;
      values.push(`${color} calc((var(--gi) + ${offset}) * 1%)`);
    }
    const endOffset = (bandCount + 2) * bandGap;
    values.push(`var(--gradient-wave-base, rgb(29,29,31)) calc((var(--gi) + ${endOffset}) * 1%)`);
    return values.join(", ");
  }, [resolvedColors, bandGap, bandCount]);

  const gradient = useMemo(
    () => radial ? `radial-gradient(circle at 50% bottom, ${stops})` : `linear-gradient(0deg, ${stops})`,
    [radial, stops],
  );

  useEffect(() => {
    const node = elementRef.current;
    if (node) node.style.setProperty("--gi", "-25");
  }, []);

  useEffect(() => {
    if (!isInView) return;
    const node = elementRef.current;
    if (!node) return;

    progressRef.current = -25;
    cyclesDoneRef.current = 0;
    finishedRef.current = false;
    startedRef.current = false;
    startAtRef.current = performance.now() + Math.max(0, delay * 1000);
    node.style.setProperty("--gi", "-25");
  }, [isInView, delay]);

  useEffect(() => {
    const node = elementRef.current;
    if (!node || !isInView) return;

    const range = 200;
    if (paused) {
      progressRef.current = range;
      finishedRef.current = true;
      node.style.setProperty("--gi", String(range));
      return;
    }

    progressRef.current = -25;
    cyclesDoneRef.current = 0;
    finishedRef.current = false;
    startedRef.current = false;
    startAtRef.current = performance.now() + Math.max(0, delay * 1000);
    node.style.setProperty("--gi", "-25");

    let last = performance.now();
    const tick = (now: number) => {
      if (finishedRef.current) return;
      if (!startedRef.current) {
        if (now >= startAtRef.current) {
          startedRef.current = true;
          last = now;
        } else {
          frameRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      const delta = Math.min(64, now - last);
      last = now;
      let next = progressRef.current + (delta * speed) / 16.6667;

      if (cycles === 0) {
        if (next >= range) next %= range;
        progressRef.current = next;
        node.style.setProperty("--gi", String(next));
      } else {
        while (next >= range && cyclesDoneRef.current < cycles) {
          next -= range;
          cyclesDoneRef.current += 1;
        }
        if (cyclesDoneRef.current >= cycles) {
          progressRef.current = range;
          node.style.setProperty("--gi", String(range));
          finishedRef.current = true;
          return;
        }
        progressRef.current = next;
        node.style.setProperty("--gi", String(next));
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [speed, paused, cycles, isInView, delay]);

  const justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  const handleClick = useCallback((event: React.MouseEvent) => onClick?.(event), [onClick]);
  const handleMouseEnter = useCallback((event: React.MouseEvent) => onMouseEnter?.(event), [onMouseEnter]);
  const handleMouseLeave = useCallback((event: React.MouseEvent) => onMouseLeave?.(event), [onMouseLeave]);

  return (
    <span
      ref={elementRef}
      className={cn("flex w-full h-full items-center [--gradient-wave-base:rgb(29,29,31)] dark:[--gradient-wave-base:rgb(255,255,255)]", className)}
      style={{ justifyContent, "--gi": -25 } as React.CSSProperties}
      aria-label={ariaLabel || undefined}
      role={ariaLabel ? "img" : undefined}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        style={{
          textAlign: align,
          backgroundImage: gradient,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          display: "inline-block",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          WebkitBackfaceVisibility: "hidden",
          backfaceVisibility: "hidden",
          transform: "translateZ(0)",
          paddingBottom: `${bottomOffset}%`,
          marginBottom: `-${bottomOffset}%`,
          paddingInline: 2,
        }}
      >
        {children}
      </span>
    </span>
  );
}

export default GradientWaveText;
