import { useState, useEffect } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePush() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [supported, setSupported] = useState(false);
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    const browserOk = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(browserOk);
    if ("Notification" in window) setPermission(Notification.permission);

    // Fetch VAPID key from server — if server has none, push is unavailable
    if (browserOk) {
      fetch("/api/push/vapid-key")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.publicKey) setVapidKey(data.publicKey); })
        .catch(() => {});
    }
  }, []);

  const subscribe = async (): Promise<PushSubscription | null> => {
    if (!supported || !vapidKey) return null;

    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return null;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });

    // Register with server — if this fails, throw so the caller knows push isn't active
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("viona_token")}`,
      },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) throw new Error("Failed to register push subscription with server");

    return sub;
  };

  // Push is only available when the browser supports it AND the server has VAPID keys
  return { supported: supported && vapidKey !== null, permission, subscribe };
}
