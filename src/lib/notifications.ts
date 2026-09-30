export type SharedNotificationType =
  | "lead_created"
  | "lead_stage_changed"
  | "task_created"
  | "task_completed"
  | "event_scheduled";

export async function publishSharedNotification(type: SharedNotificationType, entityId: string) {
  try {
    const response = await fetch("/api/notifications/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, entityId }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
