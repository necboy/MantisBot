import crypto from 'crypto';

const ALGORITHM = 'AES-256-CBC';
const CHARSET = 'utf-8';

export class DingTalkCrypto {
  private aesKey: Buffer;
  private token: string;
  private corpId: string;

  constructor(encodingAesKey: string, token: string, corpId: string) {
    this.aesKey = Buffer.from(encodingAesKey + '=', 'base64');
    this.token = token;
    this.corpId = corpId;
  }

  encrypt(text: string): { encrypt: string; msgSignature: string; timeStamp: string; nonce: string } {
    const randomStr = this.generateRandomStr(16);
    const timeStamp = Date.now().toString();
    const nonce = this.generateRandomStr(8);

    const msgCrypt = randomStr + timeStamp + nonce + text;
    const encrypt = this.aesEncrypt(msgCrypt);

    const msgSignature = this.sign([this.token, timeStamp, nonce, encrypt]);

    return { encrypt, msgSignature, timeStamp, nonce };
  }

  decrypt(msgSignature: string, timeStamp: string, nonce: string, encrypt: string): string {
    const signature = this.sign([this.token, timeStamp, nonce, encrypt]);
    if (signature !== msgSignature) {
      throw new Error('signature check failed');
    }

    const decrypted = this.aesDecrypt(encrypt);
    const content = decrypted.substring(17); // remove randomStr(16) + corpId

    return content.substring(0, content.length - 6); // remove corpId
  }

  private aesEncrypt(text: string): string {
    const cipher = crypto.createCipheriv(ALGORITHM, this.aesKey, Buffer.alloc(16, 0));
    let enc = cipher.update(text, CHARSET, 'base64');
    enc += cipher.final('base64');
    return enc;
  }

  private aesDecrypt(text: string): string {
    const decipher = crypto.createDecipheriv(ALGORITHM, this.aesKey, Buffer.alloc(16, 0));
    let dec = decipher.update(text, 'base64', CHARSET);
    dec += decipher.final(CHARSET);
    return dec;
  }

  private sign(params: string[]): string {
    const sorted = params.sort();
    const str = sorted.join('');
    return crypto.createHash('sha1').update(str).digest('hex');
  }

  private generateRandomStr(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
