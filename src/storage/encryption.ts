// src/storage/encryption.ts

import { createCipheriv, createDecipheriv, randomBytes, scrypt, createHash } from 'crypto';
import { promisify } from 'util';
import { hostname } from 'os';

const asyncScrypt = promisify(scrypt);

/**
 * 密码加密解密工具类
 * 使用AES-256-GCM算法提供安全的密码加密存储
 */
export class PasswordEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly SALT_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  private static readonly KEY_LENGTH = 32;

  private masterKey: string;

  constructor() {
    // 从环境变量获取主密钥，如果不存在则生成默认密钥
    this.masterKey = process.env.STORAGE_ENCRYPTION_KEY || this.generateDefaultKey();
  }

  /**
   * 加密密码
   * @param plaintext 明文密码
   * @returns 加密后的字符串，格式：encrypted:base64data
   */
  async encrypt(plaintext: string): Promise<string> {
    try {
      // 生成随机盐和初始向量
      const salt = randomBytes(PasswordEncryption.SALT_LENGTH);
      const iv = randomBytes(PasswordEncryption.IV_LENGTH);

      // 使用scrypt从主密钥和盐生成密钥
      const key = await asyncScrypt(this.masterKey, salt, PasswordEncryption.KEY_LENGTH) as Buffer;

      // 创建加密器
      const cipher = createCipheriv(PasswordEncryption.ALGORITHM, key, iv);

      // 加密数据
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // 获取认证标签
      const tag = cipher.getAuthTag();

      // 组合所有数据: salt + iv + tag + encrypted
      const combined = Buffer.concat([
        salt,
        iv,
        tag,
        Buffer.from(encrypted, 'hex')
      ]);

      // 返回base64编码的加密数据
      return `encrypted:${combined.toString('base64')}`;

    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 解密密码
   * @param encryptedData 加密的密码字符串
   * @returns 明文密码
   */
  async decrypt(encryptedData: string): Promise<string> {
    try {
      // 检查格式
      if (!encryptedData.startsWith('encrypted:')) {
        // 向后兼容：如果不是加密格式，直接返回（明文密码）
        return encryptedData;
      }

      // 提取base64数据
      const base64Data = encryptedData.slice(10); // 移除 "encrypted:" 前缀
      const combined = Buffer.from(base64Data, 'base64');

      // 提取各部分数据
      const salt = combined.subarray(0, PasswordEncryption.SALT_LENGTH);
      const iv = combined.subarray(PasswordEncryption.SALT_LENGTH, PasswordEncryption.SALT_LENGTH + PasswordEncryption.IV_LENGTH);
      const tag = combined.subarray(
        PasswordEncryption.SALT_LENGTH + PasswordEncryption.IV_LENGTH,
        PasswordEncryption.SALT_LENGTH + PasswordEncryption.IV_LENGTH + PasswordEncryption.TAG_LENGTH
      );
      const encrypted = combined.subarray(PasswordEncryption.SALT_LENGTH + PasswordEncryption.IV_LENGTH + PasswordEncryption.TAG_LENGTH);

      // 使用scrypt重新生成密钥
      const key = await asyncScrypt(this.masterKey, salt, PasswordEncryption.KEY_LENGTH) as Buffer;

      // 创建解密器
      const decipher = createDecipheriv(PasswordEncryption.ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      // 解密数据
      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;

    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 检查字符串是否为加密格式
   * @param data 要检查的字符串
   * @returns 是否为加密格式
   */
  isEncrypted(data: string): boolean {
    return data.startsWith('encrypted:');
  }

  /**
   * 验证加密解密功能
   * @returns 验证结果
   */
  async testEncryption(): Promise<{ success: boolean; error?: string }> {
    try {
      const testPassword = 'test-password-123';
      const encrypted = await this.encrypt(testPassword);
      const decrypted = await this.decrypt(encrypted);

      if (testPassword !== decrypted) {
        return { success: false, error: 'Decrypted password does not match original' };
      }

      // 验证加密格式
      if (!this.isEncrypted(encrypted)) {
        return { success: false, error: 'Encrypted data format is incorrect' };
      }

      return { success: true };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 生成默认密钥
   * 注意：生产环境应该使用专门的密钥管理系统
   */
  private generateDefaultKey(): string {
    console.warn('[PasswordEncryption] Using default encryption key. Set STORAGE_ENCRYPTION_KEY environment variable for production.');
    // 生成基于主机名和系统信息的确定性密钥
    const defaultSeed = `mantisbot-storage-key-${hostname()}-${process.version}`;
    return createHash('sha256').update(defaultSeed).digest('hex');
  }

  /**
   * 生成新的随机密钥
   * @returns 32字节的十六进制密钥
   */
  static generateRandomKey(): string {
    return randomBytes(32).toString('hex');
  }
}

// 导出单例实例
export const passwordEncryption = new PasswordEncryption();