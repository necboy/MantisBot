/**
 * 轻量级 token 估算工具
 *
 * 不依赖 tiktoken（避免原生模块编译问题），使用字符计数法进行估算：
 * - 英文/ASCII：约 4 字符 = 1 token
 * - 中文/日文/韩文（CJK）：约 1.5 字符 = 1 token（每个 CJK 字符约算 0.67 token）
 * - 混合文本取加权平均
 *
 * 精度：±15%，足够用于上下文截断保护。
 */

/**
 * 估算单段文本的 token 数量
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let cjkCount = 0;
  let asciiCount = 0;

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||   // CJK 统一汉字
      (code >= 0x3040 && code <= 0x30ff) ||   // 平假名/片假名
      (code >= 0xac00 && code <= 0xd7af) ||   // 韩文
      (code >= 0x3400 && code <= 0x4dbf) ||   // CJK 扩展 A
      (code >= 0x20000 && code <= 0x2a6df)    // CJK 扩展 B
    ) {
      cjkCount++;
    } else {
      asciiCount++;
    }
  }

  // CJK：约每 1.5 字符 1 token；ASCII：约每 4 字符 1 token
  return Math.ceil(cjkCount / 1.5 + asciiCount / 4);
}

export interface ConversationMessage {
  role: string;
  content: string;
}

/**
 * 估算一组对话消息的总 token 数
 * （含每条消息约 4 token 的格式开销）
 */
export function estimateConversationTokens(messages: ConversationMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += 4; // 每条消息固定格式开销（role, separators）
    total += estimateTokens(msg.content);
  }
  return total;
}

/**
 * 将字符数阈值转为等价 token 数（使用混合估算比例）
 * 默认以 1:3 的比例（比纯 ASCII 更保守）
 */
export function charsToTokensApprox(chars: number): number {
  return Math.ceil(chars / 3);
}

/**
 * 对历史消息列表执行滑动窗口截断
 *
 * 策略：
 * 1. 保留最新的消息（从末尾往前）
 * 2. 累计 token 估算，一旦超出预算就停止
 * 3. 始终保留最新的一对 (user + assistant) 消息（最少上下文保障）
 *
 * @param history   完整对话历史（时间正序）
 * @param maxChars  最大字符预算（粗估 token 用）
 * @returns         截断后的历史（时间正序）
 */
export function truncateHistory(
  history: ConversationMessage[],
  maxChars: number
): ConversationMessage[] {
  if (history.length === 0) return [];

  const budget = maxChars; // 以字符为单位，更直观

  // 计算每条消息的字符数（含少量开销）
  const sizes = history.map(msg => msg.content.length + msg.role.length + 8);

  // 从最新消息向前累计，找到能容纳的最大范围
  let accumulated = 0;
  let cutIndex = history.length; // 从哪里开始保留

  for (let i = history.length - 1; i >= 0; i--) {
    accumulated += sizes[i];
    if (accumulated > budget) {
      // 已超出预算，从 i+1 开始保留
      cutIndex = i + 1;
      break;
    }
    cutIndex = i; // 还没超出，继续往前
  }

  // 保证至少保留最后 2 条消息（最基本的上下文）
  const minKeep = Math.min(2, history.length);
  cutIndex = Math.min(cutIndex, history.length - minKeep);

  const result = history.slice(cutIndex);

  if (cutIndex > 0) {
    console.log(
      `[TokenCounter] 历史截断: 原 ${history.length} 条消息，` +
      `丢弃最旧 ${cutIndex} 条，保留 ${result.length} 条` +
      `（约 ${accumulated} 字符 / 预算 ${maxChars} 字符）`
    );
  }

  return result;
}
