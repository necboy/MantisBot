import type { Tool } from '../../types.js';
import { spawn } from 'child_process';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { broadcastToClients } from '../../channels/http-ws/ws-server.js';

const CRAWL4AI_SCRIPT = `
import asyncio
import sys
import json
import os
import re
from urllib.parse import quote_plus

# 禁用 crawl4ai 的进度输出（只输出 JSON 到 stdout）
os.environ['CRAWL4AI_VERBOSE'] = 'false'

async def crawl(params):
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode

    action = params.get('action', 'scrape')

    browser_config = BrowserConfig(
        headless=True,
        viewport_width=1920,
        viewport_height=1080,
        verbose=False
    )

    if action == 'search':
        query = params['query']
        max_results = params.get('maxResults', 20)
        engine = params.get('engine', 'bing')  # bing, baidu, sogou

        # 根据搜索引擎选择 URL
        if engine == 'baidu':
            search_url = f"https://www.baidu.com/s?wd={quote_plus(query)}&rn={max_results}"
        elif engine == 'sogou':
            search_url = f"https://www.sogou.com/web?query={quote_plus(query)}&num={max_results}"
        else:  # bing (默认)
            search_url = f"https://www.bing.com/search?q={quote_plus(query)}&count={max_results}"

        crawler_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            remove_overlay_elements=True,
            page_timeout=params.get('timeout', 30000),
            verbose=False,
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=search_url, config=crawler_config)

            if result.success:
                # 从 markdown 中提取搜索结果 URL
                urls = []

                # 提取结果链接 - 使用正则从 markdown 链接中提取
                # Markdown 格式: [Title](url)
                markdown = result.markdown or ''

                # 匹配 markdown 链接
                link_pattern = r'\\[([^\\]]+)\\]\\(([^)]+)\\)'
                matches = re.findall(link_pattern, markdown)

                # 根据搜索引擎过滤内部链接
                filter_domains = []
                if engine == 'baidu':
                    filter_domains = ['baidu.com', 'baiducontent.com', 'bdstatic.com']
                elif engine == 'sogou':
                    filter_domains = ['sogou.com', 'sogoucdn.com', 'go.sogou.com']
                else:  # bing
                    filter_domains = ['bing.com', 'microsoft.com', 'go.microsoft.com']

                for title, url in matches:
                    # 过滤掉内部链接和广告
                    url_lower = url.lower()
                    if any(domain in url_lower for domain in filter_domains):
                        continue
                    if url.startswith('http://') or url.startswith('https://'):
                        urls.append({
                            'title': title.strip(),
                            'url': url
                        })
                        if len(urls) >= max_results:
                            break

                output = {
                    'success': True,
                    'query': query,
                    'engine': engine,
                    'url_count': len(urls),
                    'urls': urls
                }
            else:
                output = {'success': False, 'error': result.error_message}

        print(json.dumps(output, ensure_ascii=False))

    elif action == 'scrape':
        url = params['url']
        css_selector = params.get('cssSelector')
        excluded_tags = params.get('excludedTags', [])

        crawler_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            remove_overlay_elements=True,
            page_timeout=params.get('timeout', 30000),
            css_selector=css_selector,
            excluded_tags=excluded_tags,
            verbose=False,
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=crawler_config)

            if result.success:
                # 截断 markdown 避免过长（SDK 会把长文本当附件）
                markdown_content = result.markdown[:8000] if result.markdown else ''
                # 限制 links 数量，避免 SDK 把大量 URL 当附件
                links_internal = result.links.get('internal', [])[:5]
                links_external = result.links.get('external', [])[:5]
                output = {
                    'success': True,
                    'url': result.url,
                    'title': result.metadata.get('title', ''),
                    'description': result.metadata.get('description', ''),
                    'markdown': markdown_content,
                    'links': {
                        'internal': links_internal,
                        'external': links_external,
                    },
                    'images_count': len(result.media.get('images', [])),
                }
            else:
                output = {'success': False, 'error': result.error_message}

        print(json.dumps(output, ensure_ascii=False))

    elif action == 'batch':
        urls = params['urls']
        max_concurrent = params.get('maxConcurrent', 5)

        crawler_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            remove_overlay_elements=True,
            page_timeout=params.get('timeout', 30000),
            verbose=False,
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            results = await crawler.arun_many(
                urls=urls,
                config=crawler_config,
                max_concurrent=max_concurrent
            )

        output = []
        for r in results:
            if r.success:
                # 批量时截断避免过大（SDK 会把长文本当附件）
                markdown_content = r.markdown[:2000] if r.markdown else ''
                output.append({
                    'success': True,
                    'url': r.url,
                    'title': r.metadata.get('title', ''),
                    'markdown': markdown_content,
                    'content_length': len(r.markdown) if r.markdown else 0,
                })
            else:
                output.append({'success': False, 'url': r.url, 'error': r.error_message})

        print(json.dumps(output, ensure_ascii=False))

if __name__ == '__main__':
    params = json.loads(sys.argv[1])
    asyncio.run(crawl(params))
`;

/**
 * Crawl4AI 工具 - 基于 Playwright 的高质量网页爬取
 * 支持 JS 渲染、动态内容、批量爬取，输出干净的 Markdown
 * 支持 Web 搜索，搜索结果 URL 会在前端浏览器面板展示
 *
 * ⚡ 推荐：优先使用此工具而非 Bash+Python，直接调用更便捷，自动处理 JSON 解析和错误
 */
export const crawl4aiTool: Tool = {
  name: 'crawl4ai',
  description: '【推荐】使用 Crawl4AI 爬取网页或搜索。支持 JavaScript 渲染，输出高质量 Markdown。适用于：动态页面、新闻文章、批量多 URL 爬取、网页搜索。搜索结果的 URL 会在前端浏览器面板以列表形式展示。支持多个搜索引擎（Bing/百度/搜狗）。相比 Bash+Python 更便捷（自动处理 JSON 解析、超时、错误）。\n\n**使用示例**：\n```json\n{"action": "search", "query": "搜索关键词"}\n{"action": "search", "query": "搜索关键词", "engine": "baidu"}\n{"action": "scrape", "url": "https://example.com"}\n{"action": "batch", "urls": ["https://a.com", "https://b.com"]}\n```',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['search', 'scrape', 'batch'],
        description: '操作类型：search（网页搜索，结果展示在前端面板）、scrape（单页爬取，默认）或 batch（批量多页爬取）'
      },
      query: {
        type: 'string',
        description: '搜索关键词（action=search 时必填）'
      },
      engine: {
        type: 'string',
        enum: ['bing', 'baidu', 'sogou'],
        description: '搜索引擎（action=search 时有效）：bing（默认，国际结果好）、baidu（百度，中文结果好）、sogou（搜狗）'
      },
      maxResults: {
        type: 'number',
        description: '搜索结果最大数量（action=search 时有效，默认 20）'
      },
      url: {
        type: 'string',
        description: '要爬取的 URL（action=scrape 时必填）'
      },
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: '要批量爬取的 URL 列表（action=batch 时必填）'
      },
      cssSelector: {
        type: 'string',
        description: '只提取指定 CSS 选择器内的内容（可选），例如 ".main-content"'
      },
      excludedTags: {
        type: 'array',
        items: { type: 'string' },
        description: '要排除的 HTML 标签列表，例如 ["nav", "footer", "aside"]'
      },
      maxConcurrent: {
        type: 'number',
        description: '批量爬取时的最大并发数（默认 5）'
      },
      timeout: {
        type: 'number',
        description: '页面加载超时时间（毫秒，默认 30000）'
      }
    },
    required: ['action']
  },

  execute: async (params: Record<string, unknown>) => {
    // 参数验证和默认值处理
    const action = (params.action as string) || 'scrape';

    // 验证 action
    if (action !== 'search' && action !== 'scrape' && action !== 'batch') {
      return {
        success: false,
        error: `Invalid action: "${action}". Must be "search", "scrape" or "batch".`,
        hint: '使用示例: {"action": "search", "query": "搜索关键词"} 或 {"action": "scrape", "url": "https://example.com"}'
      };
    }

    // 默认值处理
    if (action === 'search' && !params.query) {
      return {
        success: false,
        error: 'Missing required parameter: query (required when action=search)'
      };
    }

    if (action === 'scrape' && !params.url) {
      return {
        success: false,
        error: 'Missing required parameter: url (required when action=scrape)'
      };
    }

    if (action === 'batch' && !params.urls) {
      return {
        success: false,
        error: 'Missing required parameter: urls (required when action=batch)'
      };
    }

    // 清理参数：处理空字符串和无效值
    const cleanedParams = {
      action,
      query: params.query || null,
      engine: params.engine || 'bing',  // bing, baidu, sogou
      maxResults: typeof params.maxResults === 'number' ? params.maxResults : 20,
      url: params.url || null,
      urls: params.urls || null,
      // 空字符串转为 null，避免传给 Python 时出错
      cssSelector: params.cssSelector === '' || params.cssSelector === '""' ? null : (params.cssSelector || null),
      excludedTags: Array.isArray(params.excludedTags) ? params.excludedTags : [],
      maxConcurrent: typeof params.maxConcurrent === 'number' ? params.maxConcurrent : 5,
      timeout: typeof params.timeout === 'number' ? params.timeout : 30000
    };

    const cwd = process.cwd();
    const tmpDir = path.join(cwd, '.crawl4ai-tmp');

    if (!existsSync(tmpDir)) {
      await mkdir(tmpDir, { recursive: true });
    }

    const scriptPath = path.join(tmpDir, `crawl4ai_runner_${Date.now()}.py`);
    await writeFile(scriptPath, CRAWL4AI_SCRIPT, 'utf-8');

    return new Promise((resolve, reject) => {
      const paramsJson = JSON.stringify(cleanedParams);

      console.log(`[Crawl4AI] action=${action}, query=${params.query || ''}, url=${params.url || (params.urls as string[])?.join(',')}`);

      const child = spawn('python3', [scriptPath, paramsJson], {
        cwd,
        env: { ...process.env },
        stdio: 'pipe'
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      child.on('close', async (code) => {
        // 清理临时脚本
        try {
          const { unlink } = await import('fs/promises');
          await unlink(scriptPath);
        } catch { /* ignore */ }

        console.log(`[Crawl4AI] Exit code: ${code}, stdout length: ${stdout.length}, stderr: ${stderr.slice(-200)}`);

        if (code !== 0) {
          console.error(`[Crawl4AI] Error (exit ${code}): ${stderr}`);
          resolve({
            success: false,
            error: `crawl4ai exited with code ${code}`,
            details: stderr.slice(-500)
          });
          return;
        }

        // 如果 stdout 为空，返回错误
        if (!stdout.trim()) {
          console.error(`[Crawl4AI] No output from script. stderr: ${stderr.slice(-500)}`);
          resolve({
            success: false,
            error: 'No output from crawl4ai script',
            details: stderr.slice(-500)
          });
          return;
        }

        try {
          const output = JSON.parse(stdout.trim());

          // 如果是搜索操作且成功，广播 URL 列表到前端
          if (action === 'search' && output.success && output.urls) {
            console.log(`[Crawl4AI] Broadcasting ${output.urls.length} URLs to frontend`);
            broadcastToClients('search-urls', {
              query: output.query,
              urls: output.urls,
              timestamp: Date.now()
            });
            // 返回简洁的摘要给 agent，不返回完整 URL 列表
            resolve({
              success: true,
              query: output.query,
              url_count: output.url_count,
              message: `搜索完成，找到 ${output.url_count} 个结果，已在前端浏览器面板展示`
            });
          } else {
            resolve(output);
          }
        } catch {
          // JSON 解析失败，返回原始输出
          resolve({ success: false, error: 'Failed to parse crawl4ai output', raw: stdout.slice(0, 1000) });
        }
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to start crawl4ai: ${err.message}. Make sure crawl4ai is installed: pip install crawl4ai`));
      });
    });
  }
};
