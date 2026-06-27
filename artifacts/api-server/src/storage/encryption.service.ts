import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'crypto';

const DEV_FALLBACK_KEY = 'aaaabbbbccccddddaaaabbbbccccdddd00112233445566778899aabbccddeeff';

interface EncryptedPayload {
  iv: string;
  tag: string;
  data: string;
}

@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private key!: Buffer;

  onModuleInit() {
    const hex = process.env.STORAGE_ENCRYPTION_KEY;
    if (hex && hex.length === 64) {
      this.key = Buffer.from(hex, 'hex');
    } else {
      this.logger.warn(
        'STORAGE_ENCRYPTION_KEY is not set or is not 64 hex chars. ' +
        'Using a dev fallback key — do NOT use this in production.',
      );
      this.key = Buffer.from(DEV_FALLBACK_KEY, 'hex');
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const payload: EncryptedPayload = {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
    };
    return JSON.stringify(payload);
  }

  decrypt(ciphertext: string): string {
    const { iv, tag, data } = JSON.parse(ciphertext) as EncryptedPayload;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
}
