import crypto from 'crypto';

const ALGORITHM = 'AES-256-CBC';

export class WeComCrypto {
  private aesKey: Buffer;
  private token: string;
  private corpId: string;

  constructor(encodingAesKey: string, token: string, corpId: string) {
    this.aesKey = Buffer.from(encodingAesKey + '=', 'base64');
    this.token = token;
    this.corpId = corpId;
  }

  encrypt(text: string): string {
    const randomStr = this.generateRandomStr(16);
    const content = randomStr + Buffer.from(text).length + text + this.corpId;
    return this.aesEncrypt(content);
  }

  decrypt(encrypt: string): string {
    const decrypted = this.aesDecrypt(encrypt);
    const content = decrypted.substring(16);
    const length = parseInt(content.substring(0, 4), 10);
    return content.substring(4, 4 + length);
  }

  verifySignature(msgSignature: string, timeStamp: string, nonce: string, encrypt: string): boolean {
    const signature = this.sign([this.token, timeStamp, nonce, encrypt]);
    return signature === msgSignature;
  }

  private aesEncrypt(text: string): string {
    const cipher = crypto.createCipheriv(ALGORITHM, this.aesKey, Buffer.alloc(16, 0));
    let enc = cipher.update(text, 'utf8', 'base64');
    enc += cipher.final('base64');
    return enc;
  }

  private aesDecrypt(text: string): string {
    const decipher = crypto.createDecipheriv(ALGORITHM, this.aesKey, Buffer.alloc(16, 0));
    let dec = decipher.update(text, 'base64', 'utf8');
    dec += decipher.final('utf8');
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
