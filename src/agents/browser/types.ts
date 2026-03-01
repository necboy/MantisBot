/**
 * 浏览器工具 - 基于Playwright
 *
 * 提供简化的浏览器自动化操作
 */

import { chromium, Browser, Page, BrowserContext } from 'playwright-core';

export interface BrowserState {
  browser: Browser | null;
  context: BrowserContext | null;
  page: Page | null;
}

export interface BrowserOptions {
  headless?: boolean;
  slowMo?: number;
  timeout?: number;
}

export interface SnapshotResult {
  url: string;
  title: string;
  content: string;
  screenshot?: string;
}

export interface FormField {
  selector: string;
  value: string;
}

class BrowserManager {
  private state: BrowserState = {
    browser: null,
    context: null,
    page: null,
  };

  /**
   * 启动浏览器
   */
  async launch(options: BrowserOptions = {}): Promise<void> {
    if (this.state.browser) {
      return;
    }

    this.state.browser = await chromium.launch({
      headless: options.headless ?? true,
      slowMo: options.slowMo,
      timeout: options.timeout ?? 30000,
    });

    // 创建context时添加性能优化配置
    this.state.context = await this.state.browser.newContext({
      viewport: { width: 1280, height: 720 },  // 设置合理的视口大小
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',  // 使用常见的UA
    });

    // 设置默认导航超时
    this.state.context.setDefaultNavigationTimeout(15000);  // 15秒
    this.state.context.setDefaultTimeout(10000);  // 10秒

    this.state.page = await this.state.context.newPage();

    // 设置页面级别的超时
    this.state.page.setDefaultNavigationTimeout(15000);
    this.state.page.setDefaultTimeout(10000);
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.state.browser) {
      await this.state.browser.close();
      this.state = { browser: null, context: null, page: null };
    }
  }

  /**
   * 获取当前页面
   */
  getPage(): Page {
    if (!this.state.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.state.page;
  }

  /**
   * 检查浏览器是否已启动
   */
  isLaunched(): boolean {
    return this.state.browser !== null;
  }
}

// 全局浏览器管理器实例
export const browserManager = new BrowserManager();
