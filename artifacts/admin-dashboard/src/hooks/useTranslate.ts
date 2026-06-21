import { useState } from "react";

type TranslateOneResult = { translation: string };
type TranslateBatchResult = { translations: string[] };

async function callTranslate(body: { text: string }): Promise<string>;
async function callTranslate(body: { texts: string[] }): Promise<string[]>;
async function callTranslate(
  body: { text: string } | { texts: string[] }
): Promise<string | string[]> {
  const res = await fetch("/api/admin/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Translation failed");
  }
  if ("text" in body) {
    const data: TranslateOneResult = await res.json();
    return data.translation;
  }
  const data: TranslateBatchResult = await res.json();
  return data.translations;
}

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("capto_admin_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Hook that exposes translate helpers with a shared loading/error state.
 * Usage:
 *   const { translateOne, translateBatch, translating, translateError } = useTranslate();
 *   const hi = await translateOne("Hello world");
 *   const [hiA, hiB] = await translateBatch(["Hello", "World"]);
 */
export function useTranslate() {
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  async function translateOne(text: string): Promise<string> {
    if (!text.trim()) return "";
    setTranslating(true);
    setTranslateError(null);
    try {
      return await callTranslate({ text });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Translation failed";
      setTranslateError(msg);
      return "";
    } finally {
      setTranslating(false);
    }
  }

  async function translateBatch(texts: string[]): Promise<string[]> {
    const nonEmpty = texts.filter((t) => t.trim());
    if (nonEmpty.length === 0) return texts.map(() => "");
    setTranslating(true);
    setTranslateError(null);
    try {
      // Map results back to original indices, keeping empty strings for blank inputs
      const results = await callTranslate({ texts: nonEmpty });
      let ri = 0;
      return texts.map((t) => (t.trim() ? results[ri++] ?? "" : ""));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Translation failed";
      setTranslateError(msg);
      return texts.map(() => "");
    } finally {
      setTranslating(false);
    }
  }

  return { translateOne, translateBatch, translating, translateError };
}
