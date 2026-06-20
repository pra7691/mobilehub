import { Injectable } from '@nestjs/common';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound?: 'default' | null;
  data?: Record<string, unknown>;
}

export interface PushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

@Injectable()
export class ExpoPushService {
  async sendMany(messages: PushMessage[]): Promise<PushTicket[]> {
    if (messages.length === 0) return [];

    const CHUNK_SIZE = 100;
    const results: PushTicket[] = [];

    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
      const chunk = messages.slice(i, i + CHUNK_SIZE);
      const res = await fetch('https://exp.host/--/exponent-push-server/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'unknown');
        throw new Error(`Expo push API error ${res.status}: ${errText}`);
      }

      const json = (await res.json()) as { data: PushTicket[] };
      results.push(...(json.data ?? []));
    }

    return results;
  }
}
