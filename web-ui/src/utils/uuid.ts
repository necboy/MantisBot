/**
 * 生成 UUID v4
 * 优先使用 crypto.randomUUID()（仅限安全上下文 HTTPS/localhost），
 * 否则降级为 crypto.getRandomValues() 手动构造，确保 HTTP 环境也可正常工作。
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // 降级：用 getRandomValues 构造标准 UUID v4
  const buf = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() * 256) | 0;
  }

  buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
  buf[8] = (buf[8] & 0x3f) | 0x80; // variant RFC 4122

  const h = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
