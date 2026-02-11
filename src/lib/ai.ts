const API_URL = "https://openrouter.ai/api/v1/chat/completions";

function getApiKey(): string {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY as string;
  if (!key) throw new Error("VITE_OPENROUTER_API_KEY is missing");
  return key;
}

function getModel(): string {
  if (typeof window !== "undefined") {
    const fromStorage = window.localStorage.getItem("taskai_ai_model");
    if (fromStorage) return fromStorage;
  }
  return (import.meta.env.VITE_OPENROUTER_MODEL as string) || "openai/gpt-4o-mini";
}

async function callOpenRouter(messages: { role: "user" | "assistant" | "system"; content: string }[]) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ model: getModel(), messages, temperature: 0.6 }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `OpenRouter ${res.status}`);
  const json = JSON.parse(text);
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

export async function toSMART(taskTitle: string, context?: string) {
	const prompt = `Переформулируй задачу в формат SMART на русском. Верни JSON:
{
  "title": string,
  "smart": string
}
Задача: ${taskTitle}\nКонтекст: ${context ?? ''}`;
	const content = await callOpenRouter([{ role: 'user', content: prompt }]);
	return content;
}

export async function makeSubtasks(taskTitle: string, context?: string) {
	const prompt = `Разбей задачу на 3-7 подзадач и оцени время (час:мин). Верни JSON-массив:
[{"title": string, "estimate": "HH:MM"}]
Задача: ${taskTitle}\nКонтекст: ${context ?? ''}`;
	const content = await callOpenRouter([{ role: 'user', content: prompt }]);
	return content;
}

export async function buildDayPlan(tasks: { title: string, priority: 'low'|'medium'|'high', estimateMinutes?: number }[]) {
	const prompt = `Сгенерируй расписание дня с таймблоками (формат 24ч), учитывая приоритет:
Вход (JSON): ${JSON.stringify(tasks)}
Верни JSON-массив блоков: [{"time": "HH:MM-HH:MM", "title": string, "note": string}]`;
	const content = await callOpenRouter([{ role: 'user', content: prompt }]);
	return content;
}
