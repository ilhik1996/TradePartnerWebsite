// VIONA Service Worker — Web Push handler

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", function(event) {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body ?? "",
    icon: "/icon-192.png",
    badge: "/icon-72.png",
    tag: data.tag ?? "viona-notification",
    data: { url: data.url ?? "/" },
    vibrate: [200, 100, 200],
    actions: data.actions ?? [],
  };
  event.waitUntil(
    self.registration.showNotification(data.title ?? "VIONA", options)
  );
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clients => {
      const existing = clients.find(c => c.url === url && "focus" in c);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    })
  );
});
