export async function triggerDemoAlert(): Promise<'service-worker' | 'window'> {
  if (typeof window === 'undefined') throw new Error('Notifications are only available in browser.');
  if (!('Notification' in window)) throw new Error('Browser does not support notifications.');

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    throw new Error('Notification permission not granted.');
  }

  const title = 'AquaTrace Alert';
  const options: NotificationOptions = {
    body: 'Demo: potential water-quality anomaly detected near your monitored area.',
    icon: '/icon-192.svg',
    badge: '/icon-192.svg',
    tag: `aquatrace-demo-${Date.now()}`,
    data: { url: '/alerts' },
  };

  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return 'service-worker';
    }
  }

  // Fallback for environments where SW isn't active yet.
  new Notification(title, options);
  return 'window';
}
