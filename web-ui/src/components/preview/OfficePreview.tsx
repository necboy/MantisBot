import { useEffect, useState, useMemo } from 'react';

interface OfficePreviewProps {
  filePath: string;
  type: 'docx' | 'xlsx' | 'pptx';
  fileApiUrl?: string;  // 可选的直接访问 URL（如 /api/files/xxx.docx）
  officePreviewServer?: string;  // OnlyOffice 预览服务器地址
}

export function OfficePreview({ filePath, type, fileApiUrl, officePreviewServer }: OfficePreviewProps) {
  const [content, setContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // 计算文件 URL（用于 OnlyOffice iframe 预览）
  const fileUrl = useMemo(() => {
    if (fileApiUrl) {
      // fileApiUrl 是相对路径 /api/files/xxx.docx，需要转换为完整 URL
      const backendPort = '8118';
      const isDev = window.location.port === '3081';
      const baseUrl = isDev ? `http://localhost:${backendPort}` : window.location.origin;
      // 使用 fileApiUrl 或转换为 binary 端点
      return `${baseUrl}${fileApiUrl}`;
    }
    // 使用 binary 端点
    const backendPort = '8118';
    const isDev = window.location.port === '3081';
    const baseUrl = isDev ? `http://localhost:${backendPort}` : window.location.origin;
    return `${baseUrl}/api/explore/binary?path=${encodeURIComponent(filePath)}`;
  }, [filePath, fileApiUrl]);

  // 计算 OnlyOffice 预览 URL
  const onlyOfficePreviewUrl = useMemo(() => {
    if (!officePreviewServer) return null;

    const isDev = window.location.port === '3081';
    if (isDev) {
      // 开发模式：直接访问 OnlyOffice 服务器
      return `${officePreviewServer}/#/?url=${encodeURIComponent(fileUrl)}`;
    }
    // 生产模式：通过 nginx 代理
    return `/office-preview/#/?url=${encodeURIComponent(fileUrl)}`;
  }, [officePreviewServer, fileUrl]);

  useEffect(() => {
    // PPT 文件且配置了 OnlyOffice：使用 iframe 预览，不需要加载内容
    if (type === 'pptx' && onlyOfficePreviewUrl) {
      setContent(''); // 清空内容，使用 iframe
      setError(null);
      return;
    }

    const loadContent = async () => {
      try {
        setError(null);

        // 使用 fileApiUrl 或 binary 端点获取二进制数据
        const url = fileApiUrl
          ? fileApiUrl
          : `/api/explore/binary?path=${encodeURIComponent(filePath)}`;

        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Failed to fetch file: ${res.status}`);
        }

        // 获取 ArrayBuffer（二进制数据）
        const arrayBuffer = await res.arrayBuffer();

        if (type === 'docx') {
          const mammoth = await import('mammoth');
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setContent(result.value);
        } else if (type === 'xlsx') {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const html = XLSX.utils.sheet_to_html(firstSheet);
          setContent(html);
        } else if (type === 'pptx') {
          // pptx 没有配置 OnlyOffice，显示提示
          setContent('<p class="text-gray-500 text-center p-4">PPT 文件需要配置 OnlyOffice 预览服务器</p>');
        }
      } catch (error) {
        console.error('Failed to load office file:', error);
        setError(error instanceof Error ? error.message : 'Failed to load file');
        setContent('');
      }
    };

    loadContent();
  }, [filePath, type, fileApiUrl, onlyOfficePreviewUrl]);

  // PPT 文件且有 OnlyOffice：使用 iframe 预览
  if (type === 'pptx' && onlyOfficePreviewUrl) {
    return (
      <iframe
        src={onlyOfficePreviewUrl}
        className="w-full h-full border-0"
        title="PPT Preview"
        allow="fullscreen"
      />
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

  if (!content) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div
      className="p-4 overflow-auto h-full dark:bg-gray-800 dark:text-white"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
