interface HtmlPreviewProps {
  content: string;
}

export function HtmlPreview({ content }: HtmlPreviewProps) {
  return (
    <iframe
      srcDoc={content}
      className="w-full h-full border-0"
      sandbox="allow-scripts"
      title="HTML Preview"
    />
  );
}
