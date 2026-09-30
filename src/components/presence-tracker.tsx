"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

export function PresenceTracker({ userId, onOnlineChange }: { userId: string | null; onOnlineChange: (ids: string[]) => void }) {
  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !userId) {
      onOnlineChange([]);
      return;
    }

    let active = true;
    let lastSeenWrite = 0;
    const channel = supabase.channel("crm-presence", { config: { presence: { key: userId } } });

    const refreshOnlineUsers = () => {
      if (active) onOnlineChange(Object.keys(channel.presenceState()));
    };
    const updateLastSeen = async (force = false) => {
      const now = Date.now();
      if (!force && now - lastSeenWrite < 60_000) return;
      lastSeenWrite = now;
      const { error } = await supabase.from("chat_profiles")
        .update({ last_seen_at: new Date(now).toISOString() })
        .eq("id", userId);
      if (error) lastSeenWrite = now - 45_000;
    };
    const checkCalendarReminders = () => {
      void fetch("/api/notifications/reminders", { method: "POST" }).catch(() => undefined);
    };

    channel.on("presence", { event: "sync" }, refreshOnlineUsers);
    void channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED" && active) {
        await channel.track({ online_at: new Date().toISOString() });
        refreshOnlineUsers();
        void updateLastSeen(true);
        checkCalendarReminders();
      }
    });

    const heartbeat = window.setInterval(() => {
      void updateLastSeen();
      checkCalendarReminders();
    }, 15 * 60_000);
    const onFocus = () => { void updateLastSeen(); checkCalendarReminders(); };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") void updateLastSeen(true); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      onOnlineChange([]);
      void supabase.removeChannel(channel);
    };
  }, [userId, onOnlineChange]);

  return null;
}
