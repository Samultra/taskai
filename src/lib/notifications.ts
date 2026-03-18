const tips: string[] = [
	"Работай циклами: 25 минут фокус, 5 минут отдых.",
	"Ставь дедлайн каждой задаче — мозгу нужен ориентир.",
	"Начинай с самого важного, пока энергия на пике.",
	"Разбей большую задачу на 3–5 конкретных шагов.",
	"Убери отвлекающие факторы на время спринта.",
	"Вечером планируй 3 ключевые задачи на завтра.",
];

let stopTimerRef: (() => void) | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	// В проде на GitHub Pages отключаем регистрацию SW,
	// чтобы не было агрессивного кэширования и застревания старого бандла.
	return null;
}

export async function requestPermission(): Promise<boolean> {
	if (!('Notification' in window)) return false;
	if (Notification.permission === 'granted') return true;
	const perm = await Notification.requestPermission();
	return perm === 'granted';
}

export async function showNotification(_title: string, _body: string, _payload?: any) {
	// Ничего не делаем, т.к. SW отключён.
}

export function startTipsScheduler(intervalMinutes = 60) {
	let timer: number | null = null;
	const sendTip = async () => {
		const tip = tips[Math.floor(Math.random() * tips.length)];
		await showNotification('Совет по тайм-менеджменту', tip);
	};
	// сразу показать первый совет через минуту после включения
	timer = window.setTimeout(async function fire() {
		await sendTip();
		timer = window.setTimeout(fire, intervalMinutes * 60 * 1000);
	}, 60 * 1000);
	const stop = () => {
		if (timer) window.clearTimeout(timer);
	};
	stopTimerRef = stop;
	return stop;
}

export function stopTipsScheduler() {
	if (stopTimerRef) {
		stopTimerRef();
		stopTimerRef = null;
	}
}
