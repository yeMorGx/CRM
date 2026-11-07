"use client";

import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import type { ExcalidrawInitialDataState } from "@excalidraw/excalidraw/types";
import "@excalidraw/excalidraw/index.css";

type CanvasScene = ExcalidrawInitialDataState & { type: "excalidraw" };

export default function CanvasBoard({
  initialData,
  onChange,
}: {
  initialData: Record<string, unknown>;
  onChange: (data: Record<string, unknown>) => void;
}) {
  const isEmpty = Object.keys(initialData).length === 0;
  const isExcalidrawScene =
    initialData.type === "excalidraw" && Array.isArray(initialData.elements);

  if (!isEmpty && !isExcalidrawScene) {
    return (
      <div className="board-error" role="alert">
        Este quadro foi salvo em outro formato. Os dados existentes foram preservados;
        crie um novo quadro para usar o Excalidraw.
      </div>
    );
  }

  const scene = isExcalidrawScene
    ? (initialData as CanvasScene)
    : undefined;

  return (
    <div className="canvas-excalidraw">
      <Excalidraw
        initialData={scene}
        theme="dark"
        UIOptions={{ canvasActions: { toggleTheme: false } }}
        onChange={(elements, appState, files) => {
          const serialized = serializeAsJSON(elements, appState, files, "local");
          onChange(JSON.parse(serialized) as Record<string, unknown>);
        }}
      />
    </div>
  );
}
