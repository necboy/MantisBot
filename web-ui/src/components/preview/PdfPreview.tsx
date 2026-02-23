import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

// 设置 PDF.js worker
// 使用 vite 的 ?url 后缀导入，确保路径在开发和生产环境都正确
import PdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = PdfWorkerUrl;

interface PdfPreviewProps {
  src: string;
}

export function PdfPreview({ src }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const renderingRef = useRef(false);

  // 加载 PDF 文档
  useEffect(() => {
    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      setPdfDoc(null);
      setTotalPages(0);

      try {
        console.log('[PdfPreview] Loading PDF from:', src);
        const loadingTask = pdfjsLib.getDocument(src);
        const pdf = await loadingTask.promise;
        console.log('[PdfPreview] PDF loaded, pages:', pdf.numPages);
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setLoading(false);
      } catch (err) {
        console.error('[PdfPreview] Failed to load PDF:', err);
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    };

    loadPdf();
  }, [src]);

  // 渲染所有页面
  useEffect(() => {
    if (!pdfDoc || !containerRef.current) {
      console.log('[PdfPreview] Skipping render - no pdfDoc or container');
      return;
    }

    // 防止重复渲染
    if (renderingRef.current) {
      console.log('[PdfPreview] Already rendering, skip');
      return;
    }

    const container = containerRef.current;
    const currentScale = scale;

    const renderAllPages = async () => {
      renderingRef.current = true;
      console.log('[PdfPreview] Starting to render', totalPages, 'pages at scale', currentScale);

      // 清空容器
      container.innerHTML = '';

      try {
        // 为每一页创建 canvas 并渲染
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          console.log(`[PdfPreview] Rendering page ${pageNum}/${totalPages}`);

          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: currentScale });

          // 创建 canvas
          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-page-canvas';
          canvas.style.display = 'block';
          canvas.style.marginBottom = '20px';
          canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          container.appendChild(canvas);

          // 渲染页面到 canvas
          const context = canvas.getContext('2d');
          if (!context) {
            console.error(`[PdfPreview] Failed to get 2d context for page ${pageNum}`);
            continue;
          }

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
            canvas: canvas
          };

          await page.render(renderContext).promise;
          console.log(`[PdfPreview] Page ${pageNum} rendered successfully`);
        }

        console.log('[PdfPreview] All pages rendered');
      } catch (err) {
        console.error('[PdfPreview] Error rendering pages:', err);
      } finally {
        renderingRef.current = false;
      }
    };

    renderAllPages();
  }, [pdfDoc, totalPages, scale]);

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.2, 3));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.2, 0.5));
  };

  const fitWidth = () => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 40; // padding
    setScale(containerWidth / 612); // 假设标准 A4 宽度 612pt
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500 p-4">
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 border-b dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm dark:text-gray-200">
            共 {totalPages} 页
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fitWidth}
            className="px-3 py-1 text-sm bg-white dark:bg-gray-700 rounded border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            适应宽度
          </button>
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="px-3 py-1 text-sm bg-white dark:bg-gray-700 rounded border dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            缩小
          </button>
          <span className="text-sm dark:text-gray-200 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 3}
            className="px-3 py-1 text-sm bg-white dark:bg-gray-700 rounded border dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            放大
          </button>
        </div>
      </div>

      {/* PDF 页面容器 - 支持滚动 */}
      <div className="flex-1 overflow-auto bg-gray-300 dark:bg-gray-900 p-5">
        <div
          ref={containerRef}
          className="flex flex-col items-center"
        />
      </div>
    </div>
  );
}
