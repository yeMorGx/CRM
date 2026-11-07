"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileWarning } from "lucide-react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";

export default function DocumentPdfPreview({ url, title, thumbnail = false }: { url: string; title: string; thumbnail?: boolean }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!thumbnail);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);
  const [renderedPage, setRenderedPage] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const resize = new ResizeObserver(entries => setWidth(Math.floor(entries[0].contentRect.width)));
    resize.observe(element);
    const intersection = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); intersection.disconnect(); } }, { rootMargin: "150px" });
    intersection.observe(element);
    return () => { resize.disconnect(); intersection.disconnect(); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    void import("pdfjs-dist").then(library => {
      if (!active) return;
      library.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      task = library.getDocument({ url, cMapUrl: "/pdfjs/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdfjs/standard_fonts/", wasmUrl: "/pdfjs/wasm/" });
      return task.promise;
    }).then(document => { if (active && document) setPdf(document); }).catch(() => { if (active) setError(true); });
    return () => { active = false; void task?.destroy(); };
  }, [url, visible]);

  useEffect(() => {
    if (!pdf || !width || !canvas.current) return;
    let active = true;
    let render: RenderTask | undefined;
    const element = canvas.current;
    void pdf.getPage(page).then(pdfPage => {
      if (!active) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const original = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: width / original.width });
      element.width = Math.floor(viewport.width * ratio);
      element.height = Math.floor(viewport.height * ratio);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      render = pdfPage.render({ canvas: element, viewport, transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0] });
      return render.promise;
    }).then(() => { if (active) setRenderedPage(page); }).catch(() => { if (active) setError(true); });
    return () => { active = false; render?.cancel(); };
  }, [pdf, page, width]);

  return <div className={`document-pdf ${thumbnail ? "document-pdf-thumbnail" : "document-pdf-reader"}`}>
    {!thumbnail && pdf && <div className="document-pdf-navigation"><button aria-label="Página anterior" disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /></button><span>Página {page} de {pdf.numPages}</span><button aria-label="Próxima página" disabled={page === pdf.numPages} onClick={() => setPage(value => value + 1)}><ChevronRight size={16} /></button></div>}
    <div ref={container} className="document-pdf-canvas" aria-busy={!error && renderedPage !== page}>
      <canvas ref={canvas} role="img" aria-label={`${title}, página ${page}`} style={{ visibility: renderedPage === page ? "visible" : "hidden" }} />
      {error ? <div className="document-preview-message"><FileWarning size={24} /><span>Prévia indisponível</span>{!thumbnail && <a href={url} target="_blank" rel="noreferrer">Abrir PDF original</a>}</div> : renderedPage !== page && <div className="document-preview-message" role="status">Carregando página...</div>}
    </div>
    {!thumbnail && <p className="document-pdf-accessible">Prévia visual do arquivo. <a href={url} target="_blank" rel="noreferrer">Abrir o PDF original para selecionar texto ou usar um leitor de tela.</a></p>}
  </div>;
}
