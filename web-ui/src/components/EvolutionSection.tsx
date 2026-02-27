import { useState, useEffect } from 'react';
import { Check, X, RefreshCw, FileText, Clock, User } from 'lucide-react';
import { authFetch } from '../utils/auth';

interface EvolutionProposal {
  id: string;
  profileName: string;
  file: 'SOUL.md' | 'IDENTITY.md' | 'USER.md';
  currentContent: string;
  proposedContent: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected';

export function EvolutionSection() {
  const [proposals, setProposals] = useState<EvolutionProposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProposals();
  }, []);

  async function fetchProposals() {
    setLoading(true);
    try {
      const res = await authFetch('/api/evolutions');
      const data = await res.json();
      setProposals(data.proposals || []);
    } catch (err) {
      console.error('Failed to fetch evolutions:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string) {
    try {
      await authFetch(`/api/evolutions/${id}/approve`, { method: 'PUT' });
      await fetchProposals();
    } catch (err) {
      console.error('Failed to approve evolution:', err);
    }
  }

  async function handleReject(id: string) {
    try {
      await authFetch(`/api/evolutions/${id}/reject`, { method: 'PUT' });
      await fetchProposals();
    } catch (err) {
      console.error('Failed to reject evolution:', err);
    }
  }

  const filteredProposals = proposals.filter(p =>
    filterStatus === 'all' ? true : p.status === filterStatus
  );

  const selectedProposal = proposals.find(p => p.id === selectedId);

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: EvolutionProposal['status']) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    };
    const labels = {
      pending: '待确认',
      approved: '已同意',
      rejected: '已拒绝',
    };
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getFileLabel = (file: EvolutionProposal['file']) => {
    return file === 'SOUL.md' ? 'SOUL' : file === 'IDENTITY.md' ? 'IDENTITY' : 'USER';
  };

  return (
    <div className="flex h-[500px]">
      {/* 左侧：提议列表 */}
      <div className="w-72 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* 筛选和刷新 */}
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
          >
            <option value="all">全部</option>
            <option value="pending">待确认</option>
            <option value="approved">已同意</option>
            <option value="rejected">已拒绝</option>
          </select>
          <button
            onClick={fetchProposals}
            disabled={loading}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            title="刷新"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {filteredProposals.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              暂无演变提议
            </div>
          ) : (
            filteredProposals
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((proposal) => (
                <div
                  key={proposal.id}
                  className={`p-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                    selectedId === proposal.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                  }`}
                  onClick={() => setSelectedId(proposal.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate flex-1 mr-2">
                      {proposal.profileName}
                    </span>
                    {getStatusBadge(proposal.status)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <FileText className="w-3 h-3" />
                    <span>{getFileLabel(proposal.file)}</span>
                    <span className="flex items-center gap-1 ml-auto">
                      <Clock className="w-3 h-3" />
                      {formatTime(proposal.createdAt)}
                    </span>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {/* 右侧：详情 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedProposal ? (
          <>
            {/* 详情头部 */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-gray-500" />
                <span className="font-medium">{selectedProposal.profileName}</span>
                <span className="text-gray-400">/</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {selectedProposal.file}
                </span>
                {getStatusBadge(selectedProposal.status)}
              </div>
              <div className="text-xs text-gray-500">
                创建于 {new Date(selectedProposal.createdAt).toLocaleString('zh-CN')}
              </div>
            </div>

            {/* 详情内容 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* 修改理由 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  修改理由
                </h4>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-400">
                  {selectedProposal.reason}
                </div>
              </div>

              {/* 当前内容 vs 提议内容 */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  当前内容
                </h4>
                <pre className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap max-h-32">
                  {selectedProposal.currentContent || '(空)'}
                </pre>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  提议内容
                </h4>
                <pre className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap max-h-32">
                  {selectedProposal.proposedContent}
                </pre>
              </div>
            </div>

            {/* 操作按钮 */}
            {selectedProposal.status === 'pending' && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3 justify-end">
                <button
                  onClick={() => handleReject(selectedProposal.id)}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 rounded"
                >
                  <X className="w-4 h-4" />
                  拒绝
                </button>
                <button
                  onClick={() => handleApprove(selectedProposal.id)}
                  className="flex items-center gap-1 px-4 py-2 text-sm bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 rounded"
                >
                  <Check className="w-4 h-4" />
                  批准
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            选择一个提议查看详情
          </div>
        )}
      </div>
    </div>
  );
}
