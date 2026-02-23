import { X, File, Folder } from 'lucide-react';

interface FileReference {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  ext?: string;
  mimeType?: string;
  addedAt: number;
}

interface FileReferenceTagsProps {
  references: FileReference[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function FileReferenceTags({ references, onRemove, onClear }: FileReferenceTagsProps) {
  if (references.length === 0) return null;

  return (
    <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-500 dark:text-gray-400">引用：</span>
        {references.map(ref => (
          <div
            key={ref.id}
            className="flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900/30
                       text-primary-700 dark:text-primary-300 rounded-full text-xs"
          >
            {ref.type === 'directory' ? (
              <Folder className="w-3 h-3" />
            ) : (
              <File className="w-3 h-3" />
            )}
            <span className="max-w-[150px] truncate">{ref.name}</span>
            <button
              onClick={() => onRemove(ref.id)}
              className="ml-1 hover:text-red-500 dark:hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {references.length > 1 && (
          <button
            onClick={onClear}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
          >
            清空全部
          </button>
        )}
      </div>
    </div>
  );
}
