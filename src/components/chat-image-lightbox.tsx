"use client";

import { ChevronLeft, ChevronRight, Download, Minus, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Item = { id: string; url: string; path: string; sender: string };

export function ChatImageLightbox({ images, selectedId, onClose }: { images: Item[]; selectedId: string; onClose: () => void }) {
  const index = images.findIndex((image) => image.id === selectedId);
  const item = images[index];
  const [activeId, setActiveId] = useState(selectedId);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [downloadError, setDownloadError] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistance = useRef<number | null>(null);
  const lastTap = useRef(0);
  const ignoreDoubleClick = useRef(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const currentIndex = images.findIndex((image) => image.id === activeId);
  const current = images[currentIndex] ?? item;

  function adjustZoom(change: (value: number) => number) {
    const next = Math.min(5, Math.max(1, change(zoom)));
    setZoom(next);
    if (next === 1) setPosition({ x: 0, y: 0 });
  }

  const change = useCallback((step: number) => {
    setActiveId((id) => {
      const at = images.findIndex((image) => image.id === id);
      return images[(at + step + images.length) % images.length]?.id ?? id;
    });
    setZoom(1); setPosition({ x: 0, y: 0 });
  }, [images]);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus.current?.focus(); };
  }, []);

  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key === "ArrowRight" && images.length > 1) change(1);
      if (event.key === "ArrowLeft" && images.length > 1) change(-1);
      if (event.key === "Tab") {
        const controls = Array.from(document.querySelectorAll<HTMLElement>(".chat-lightbox button"));
        const at = controls.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && at === 0) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && at === controls.length - 1) { event.preventDefault(); controls[0]?.focus(); }
      }
    }
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [change, images.length, onClose]);

  async function download() {
    if (!current) return;
    setDownloadError(false);
    try {
      const response = await fetch(current.url);
      if (!response.ok) throw new Error("download");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const ext = current.path.split(".").at(-1)?.toLowerCase();
      anchor.href = objectUrl;
      anchor.download = `conversa-${current.id}.${["png", "jpg", "jpeg", "webp"].includes(ext ?? "") ? ext : "jpg"}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch { setDownloadError(true); }
  }

  if (!current) return null;
  return createPortal(<div className="chat-lightbox" role="dialog" aria-modal="true" aria-label="Visualizador de imagem" onClick={onClose}>
    <div className="chat-lightbox-toolbar" onClick={(event) => event.stopPropagation()}>
      <span>{currentIndex + 1} / {images.length}</span>
      <button type="button" onClick={() => adjustZoom((value) => value - 0.5)} aria-label="Diminuir zoom"><Minus size={20} /></button>
      <button type="button" onClick={() => adjustZoom((value) => value + 0.5)} aria-label="Aumentar zoom"><Plus size={20} /></button>
      <button type="button" onClick={() => void download()} aria-label="Baixar imagem"><Download size={20} /></button>
      <button ref={closeButton} type="button" onClick={onClose} aria-label="Fechar imagem"><X size={21} /></button>
    </div>
    {downloadError && <p className="chat-lightbox-error" role="alert">Não foi possível baixar a imagem. Tente novamente.</p>}
    {images.length > 1 && <button className="chat-lightbox-prev" type="button" onClick={(event) => { event.stopPropagation(); change(-1); }} aria-label="Imagem anterior"><ChevronLeft /></button>}
    <div className="chat-lightbox-stage" onWheel={(event) => { event.preventDefault(); adjustZoom((value) => value + (event.deltaY < 0 ? 0.2 : -0.2)); }} onDoubleClick={(event) => { event.stopPropagation(); if (ignoreDoubleClick.current) { ignoreDoubleClick.current = false; return; } adjustZoom((value) => value > 1 ? 1 : 2); setPosition({ x: 0, y: 0 }); }}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (event.pointerType !== "touch") ignoreDoubleClick.current = false; if (event.pointerType === "touch" && Date.now() - lastTap.current < 280) { ignoreDoubleClick.current = true; adjustZoom((value) => value > 1 ? 1 : 2); setPosition({ x: 0, y: 0 }); } lastTap.current = event.pointerType === "touch" ? Date.now() : 0; }}
      onPointerMove={(event) => { const prior = pointers.current.get(event.pointerId); if (!prior) return; pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; const distance = Math.hypot(a.x - b.x, a.y - b.y); if (pinchDistance.current) setZoom((value) => Math.min(5, Math.max(1, value * distance / pinchDistance.current!))); pinchDistance.current = distance; } else if (zoom > 1) setPosition((value) => ({ x: value.x + event.clientX - prior.x, y: value.y + event.clientY - prior.y })); }}
      onPointerUp={(event) => { pointers.current.delete(event.pointerId); pinchDistance.current = null; }} onPointerCancel={(event) => { pointers.current.delete(event.pointerId); pinchDistance.current = null; }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={current.id} src={current.url} alt={`Imagem enviada por ${current.sender}`} draggable={false} style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})` }} onClick={(event) => event.stopPropagation()} />
    </div>
    {images.length > 1 && <button className="chat-lightbox-next" type="button" onClick={(event) => { event.stopPropagation(); change(1); }} aria-label="Próxima imagem"><ChevronRight /></button>}
  </div>, document.querySelector(".crm-shell") ?? document.body);
}
