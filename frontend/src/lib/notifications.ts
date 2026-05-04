export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission === "denied") {
    return false;
  }
  const p = await Notification.requestPermission();
  return p === "granted";
}

export function showIncomingCallNotification(fromName: string, roomHint: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") {
    return;
  }
  try {
    new Notification(`Incoming call — ${fromName}`, {
      body: `Room: ${roomHint}`,
      tag: "letsgo-incoming-call",
    });
  } catch {
    // ignore
  }
}
