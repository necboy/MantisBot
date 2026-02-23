// @ts-nocheck - Browser code uses DOM APIs in Playwright evaluate() context
/**
 * 浏览器操作函数
 */

import { browserManager, SnapshotResult, FormField } from './types.js';

/**
 * 导航到URL
 */
export async function browserNavigate(url: string): Promise<{ url: string; title: string }> {
  const page = browserManager.getPage();
  // 使用 domcontentloaded 策略，更快完成加载
  // 比默认的 load 事件更快，且足够使用
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 15000  // 15秒超时
  });

  return {
    url: page.url(),
    title: await page.title(),
  };
}

/**
 * 点击元素
 */
export async function browserClick(selector: string): Promise<void> {
  const page = browserManager.getPage();
  await page.click(selector);
}

/**
 * 输入文本
 */
export async function browserType(selector: string, text: string, pressEnter: boolean = false): Promise<void> {
  const page = browserManager.getPage();
  await page.fill(selector, text);

  if (pressEnter) {
    await page.press(selector, 'Enter');
  }
}

/**
 * 按键
 */
export async function browserPress(key: string): Promise<void> {
  const page = browserManager.getPage();
  await page.keyboard.press(key);
}

/**
 * 等待元素
 */
export async function browserWait(selector: string, timeout: number = 30000): Promise<void> {
  const page = browserManager.getPage();
  await page.waitForSelector(selector, { timeout });
}

/**
 * 等待指定时间
 */
export async function browserWaitFor(time: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, time));
}

/**
 * 截图
 */
export async function browserScreenshot(fullPage: boolean = false): Promise<string> {
  const page = browserManager.getPage();
  const screenshot = await page.screenshot({
    fullPage,
    type: 'png',
  });

  return screenshot.toString('base64');
}

/**
 * 获取页面快照（文本内容）
 */
export async function browserSnapshot(): Promise<SnapshotResult> {
  const page = browserManager.getPage();

  const url = page.url();
  const title = await page.title();

  // 获取可见文本内容（在浏览器上下文中执行，有 DOM API）
  // @ts-ignore - Playwright evaluate 在浏览器上下文中运行
  const content = await page.evaluate(() => {
    const body = document.body;
    const walker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT,
      null
    );

    const texts: string[] = [];
    let node: Node | null;

    while (node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (text && text.length > 0) {
        texts.push(text);
      }
    }

    return texts.join('\n');
  });

  return {
    url,
    title,
    content,
  };
}

/**
 * 填充表单
 */
export async function browserFillForm(fields: FormField[]): Promise<void> {
  const page = browserManager.getPage();

  for (const field of fields) {
    await page.fill(field.selector, field.value);
  }
}

/**
 * 执行JavaScript
 */
export async function browserEvaluate(code: string): Promise<unknown> {
  const page = browserManager.getPage();
  return await page.evaluate(code);
}

/**
 * 获取元素文本
 */
export async function browserGetText(selector: string): Promise<string> {
  const page = browserManager.getPage();
  return await page.textContent(selector) || '';
}

/**
 * 检查元素是否存在
 */
export async function browserExists(selector: string): Promise<boolean> {
  const page = browserManager.getPage();
  const element = await page.$(selector);
  return element !== null;
}

/**
 * 选择下拉选项
 */
export async function browserSelect(selector: string, value: string): Promise<void> {
  const page = browserManager.getPage();
  await page.selectOption(selector, value);
}

/**
 * 上传文件
 */
export async function browserUpload(selector: string, filePath: string): Promise<void> {
  const page = browserManager.getPage();
  await page.setInputFiles(selector, filePath);
}

/**
 * 返回上一页
 */
export async function browserGoBack(): Promise<void> {
  const page = browserManager.getPage();
  await page.goBack();
}

/**
 * 前进到下一页
 */
export async function browserGoForward(): Promise<void> {
  const page = browserManager.getPage();
  await page.goForward();
}

/**
 * 刷新页面
 */
export async function browserRefresh(): Promise<void> {
  const page = browserManager.getPage();
  await page.reload();
}

/**
 * 获取页面HTML
 */
export async function browserGetHTML(): Promise<string> {
  const page = browserManager.getPage();
  return await page.content();
}

/**
 * 设置视口大小
 */
export async function browserSetViewport(width: number, height: number): Promise<void> {
  const page = browserManager.getPage();
  await page.setViewportSize({ width, height });
}

/**
 * 悬停元素
 */
export async function browserHover(selector: string): Promise<void> {
  const page = browserManager.getPage();
  await page.hover(selector);
}

/**
 * 右键点击
 */
export async function browserRightClick(selector: string): Promise<void> {
  const page = browserManager.getPage();
  await page.click(selector, { button: 'right' });
}

/**
 * 双击
 */
export async function browserDoubleClick(selector: string): Promise<void> {
  const page = browserManager.getPage();
  await page.dblclick(selector);
}

/**
 * 获取Cookie
 */
export async function browserGetCookies(): Promise<Array<{ name: string; value: string; domain: string }>> {
  const page = browserManager.getPage();
  const context = page.context();
  const cookies = await context.cookies();

  return cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
  }));
}

/**
 * 设置Cookie
 */
export async function browserSetCookie(name: string, value: string, domain: string): Promise<void> {
  const page = browserManager.getPage();
  const context = page.context();

  await context.addCookies([{
    name,
    value,
    domain,
    path: '/',
  }]);
}
