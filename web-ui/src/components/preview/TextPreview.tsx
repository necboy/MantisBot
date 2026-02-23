import { useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/themes/prism.css';

interface TextPreviewProps {
  content: string;
  language?: string;
}

export function TextPreview({ content, language = 'plaintext' }: TextPreviewProps) {
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [content]);

  return (
    <pre className="p-4 overflow-auto h-full dark:bg-gray-800">
      <code ref={codeRef} className={`language-${language}`}>
        {content}
      </code>
    </pre>
  );
}
