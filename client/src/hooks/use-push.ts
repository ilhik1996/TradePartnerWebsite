import { useState, useEffect } from "react";

// VAPID public key — generate real one in production:
// npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
  ?? "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

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

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  const subscribe = async (): Promise<PushSubscription | null> => {
    if (!supported) return null;

    // Register service worker
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const perm = await Notification.requestPermission();
    setPermission(perm);
    if (perm !== "granted") return null;

    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Send subscription to backend
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("viona_token")}`,
      },
      body: JSON.stringify(sub.toJSON()),
    }).catch(() => {});

    return sub;
  };

  return { supported, permission, subscribe };
}
