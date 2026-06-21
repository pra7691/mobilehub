import { Injectable, InternalServerErrorException } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class TranslateService {
  private readonly openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async translateOne(text: string): Promise<string> {
    if (!text.trim()) return '';
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content:
            'You are a professional Hindi translator. Translate the given English text to Hindi accurately and naturally. Return only the Hindi translation, nothing else. Preserve formatting like line breaks.',
        },
        { role: 'user', content: text },
      ],
    });
    const result = response.choices[0]?.message?.content?.trim();
    if (!result) throw new InternalServerErrorException('Translation failed');
    return result;
  }

  async translateBatch(texts: string[]): Promise<string[]> {
    if (texts.length === 0) return [];
    const numbered = texts
      .map((t, i) => `[${i + 1}] ${t}`)
      .join('\n---\n');

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      messages: [
        {
          role: 'system',
          content:
            'You are a professional Hindi translator. Translate each numbered English segment to Hindi. Return them in the same numbered format [1], [2], etc., separated by ---. Return only translations, nothing else.',
        },
        { role: 'user', content: numbered },
      ],
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    // Parse numbered segments like [1] ... [2] ... regardless of separator used
    const segmentMap: Record<number, string> = {};
    const segmentRegex = /\[(\d+)\]\s*([\s\S]*?)(?=\[\d+\]|$)/g;
    let match: RegExpExecArray | null;
    while ((match = segmentRegex.exec(raw)) !== null) {
      const idx = parseInt(match[1], 10) - 1;
      segmentMap[idx] = match[2].replace(/\s*---\s*$/, '').trim();
    }
    return texts.map((_, i) => segmentMap[i] ?? '');
  }
}
