self.addEventListener('install', (event) => {
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	self.clients.claim();
});

self.addEventListener('message', (event) => {
	const data = event.data || {};
	if (data.type === 'SHOW_NOTIFICATION') {
		const base = self.registration.scope || '/taskai/';
		self.registration.showNotification(data.title || 'TaskAI', {
			body: data.body || '',
			icon: base + 'taskAI.png?v=6',
			badge: base + 'taskAI.png?v=6',
			data: data.payload || {},
		});
	}
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();
	event.waitUntil((async () => {
		const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
		if (allClients.length > 0) {
			const client = allClients[0];
			client.focus();
		} else if (self.registration.scope) {
			clients.openWindow(self.registration.scope);
		}
	})());
});
