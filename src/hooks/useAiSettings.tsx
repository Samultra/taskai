import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

export type AiModelOption = {
  id: string;
  label: string;
};

const AVAILABLE_MODELS: AiModelOption[] = [
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini (быстрый)" },
  { id: "openai/gpt-4.1-mini", label: "GPT-4.1 mini" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1" },
];

interface AiSettingsContextValue {
  model: string;
  setModel: (value: string) => void;
  models: AiModelOption[];
}

const AiSettingsContext = createContext<AiSettingsContextValue | undefined>(undefined);

const STORAGE_KEY = "taskai_ai_model";

export const AiSettingsProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const [model, setModelState] = useState<string>(() => {
    if (typeof window === "undefined") return AVAILABLE_MODELS[0]?.id ?? "openai/gpt-4o-mini";
    return localStorage.getItem(STORAGE_KEY) || AVAILABLE_MODELS[0]?.id || "openai/gpt-4o-mini";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, model);
    }
  }, [model]);

  const setModel = (value: string) => {
    // только админ может менять глобальную модель
    if (profile?.role !== "admin") return;
    setModelState(value);
  };

  return (
    <AiSettingsContext.Provider
      value={{
        model,
        setModel,
        models: AVAILABLE_MODELS,
      }}
    >
      {children}
    </AiSettingsContext.Provider>
  );
};

export const useAiSettings = () => {
  const ctx = useContext(AiSettingsContext);
  if (!ctx) throw new Error("useAiSettings must be used within AiSettingsProvider");
  return ctx;
};

