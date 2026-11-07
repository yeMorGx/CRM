export type BoardType = "canvas" | "flow";
export type CanvasBoardRecord = { id: string; user_id: string; type: BoardType; title: string; data: Record<string, unknown>; created_at: string; updated_at: string };
