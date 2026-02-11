import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, X, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAiSettings } from "@/hooks/useAiSettings";
import { useAuth } from "@/hooks/useAuth";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIChat = ({ isOpen, onClose }: AIChatProps) => {
  const { profile } = useAuth();
  const { model, setModel, models } = useAiSettings();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant", 
      content: "Привет! Я твой ИИ-помощник по планированию дел. Расскажи, что планируешь сегодня, и я дам советы по тайм-менеджменту!",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const callOpenRouter = async (history: { role: "user" | "assistant"; content: string }[]) => {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY as string;
    const modelFromEnv = model || (import.meta.env.VITE_OPENROUTER_MODEL as string) || "openai/gpt-4o-mini";
    if (!apiKey) throw new Error("OPENROUTER API KEY не задан (VITE_OPENROUTER_API_KEY)");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelFromEnv,
        messages: history.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.7,
      }),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `OpenRouter error: ${res.status}`);
    }

    const json = JSON.parse(text);
    const content: string = json.choices?.[0]?.message?.content ?? "";
    return content.trim();
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    try {
      const history = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));
      const answer = await callOpenRouter(history);

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: answer || "Извини, не удалось получить ответ.",
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err: any) {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "Произошла ошибка при обращении к ИИ. Проверьте ключ API или смените модель в .env (VITE_OPENROUTER_MODEL).",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMessage]);
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      "fixed inset-y-0 right-0 w-80 z-50 transition-transform duration-300",
      "lg:w-96 max-w-full",
      "chat-slide-in"
    )}>
      <Card className="h-full glass-effect border-l-[3px] border-primary shadow-floating">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-gradient-ai gap-2">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bot className="h-6 w-6 text-primary-foreground" />
              <div className="absolute -top-1 -right-1 h-3 w-3 bg-success rounded-full animate-pulse" />
            </div>
            <div>
              <h2 className="font-semibold text-primary-foreground flex items-center gap-1">
                ИИ-Помощник
                <Sparkles className="h-3 w-3" />
              </h2>
              <p className="text-[11px] text-primary-foreground/80">
                {profile?.role === "admin" ? "Режим администратора" : "Всегда онлайн"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {profile?.role === "admin" && (
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="h-8 w-40 bg-white/10 border-white/30 text-primary-foreground text-[11px]">
                  <SelectValue placeholder="Модель ИИ" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-primary-foreground hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 h-[calc(100vh-140px)]" ref={scrollAreaRef}>
          <div className="p-4 space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex gap-3 animate-fade-in",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {message.role === "assistant" && (
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg p-3 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border"
                  )}
                >
                  <p>{message.content}</p>
                  <p className={cn(
                    "text-xs mt-1 opacity-60",
                    message.role === "user" ? "text-primary-foreground" : "text-muted-foreground"
                  )}>
                    {message.timestamp.toLocaleTimeString('ru-RU', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>

                {message.role === "user" && (
                  <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                    <User className="h-4 w-4 text-accent" />
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3 justify-start animate-fade-in">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-card border rounded-lg p-3">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 bg-primary/60 rounded-full animate-bounce" />
                    <div className="h-2 w-2 bg-primary/60 rounded-full animate-bounce delay-100" />
                    <div className="h-2 w-2 bg-primary/60 rounded-full animate-bounce delay-200" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t bg-card/50">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Напиши о своих планах..."
              className="flex-1"
              disabled={isTyping}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isTyping}
              className="px-3"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AIChat;