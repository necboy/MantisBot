interface ImagePreviewProps {
  src: string;
}

export function ImagePreview({ src }: ImagePreviewProps) {
  return (
    <div className="flex items-center justify-center h-full p-4">
      <img
        src={src}
        alt="Preview"
        className="max-w-full max-h-full object-contain rounded"
      />
    </div>
  );
}
