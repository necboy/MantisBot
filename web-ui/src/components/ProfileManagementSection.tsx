import { useState, useEffect } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';

interface ProfileMeta {
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
}

interface Profile {
  name: string;
  description?: string;
  soul?: string;
  identity?: string;
  user?: string;
}

interface ProfileManagementSectionProps {
  activeProfile: string;
  onProfileChange: (name: string) => void;
}

export function ProfileManagementSection({ activeProfile, onProfileChange }: ProfileManagementSectionProps) {
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [profileContent, setProfileContent] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState<'soul' | 'identity' | 'user'>('soul');
  const [loading, setLoading] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [showNewProfile, setShowNewProfile] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, []);

  async function fetchProfiles() {
    try {
      const res = await fetch('/api/profiles');
      const data = await res.json();
      setProfiles(data.profiles);
      if (!selectedProfile && data.profiles.length > 0) {
        selectProfile(data.activeProfile || data.profiles[0].name);
      }
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
    }
  }

  async function selectProfile(name: string) {
    setSelectedProfile(name);
    setLoading(true);
    try {
      const res = await fetch(`/api/profiles/${name}`);
      const data = await res.json();
      setProfileContent(data);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!profileContent || !selectedProfile) return;

    setLoading(true);
    try {
      await fetch(`/api/profiles/${selectedProfile}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileContent),
      });
      await fetchProfiles();
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProfile() {
    if (!newProfileName.trim()) return;

    setLoading(true);
    try {
      await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProfileName }),
      });
      setNewProfileName('');
      setShowNewProfile(false);
      await fetchProfiles();
      selectProfile(newProfileName);
    } catch (err) {
      console.error('Failed to create profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteProfile(name: string) {
    if (!confirm(`确定要删除配置 "${name}" 吗？`)) return;

    setLoading(true);
    try {
      await fetch(`/api/profiles/${name}`, { method: 'DELETE' });
      if (selectedProfile === name) {
        setSelectedProfile(null);
        setProfileContent(null);
      }
      await fetchProfiles();
    } catch (err) {
      console.error('Failed to delete profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSetActive(name: string) {
    try {
      await fetch('/api/profiles/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      onProfileChange(name);
    } catch (err) {
      console.error('Failed to set active profile:', err);
    }
  }

  return (
    <div className="flex h-[500px]">
      {/* 左侧：配置列表 */}
      <div className="w-48 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setShowNewProfile(true)}
            className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" /> 新建
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {profiles.map((profile) => (
            <div
              key={profile.name}
              className={`p-3 border-b border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                selectedProfile === profile.name ? 'bg-primary-50 dark:bg-primary-900/20' : ''
              }`}
              onClick={() => selectProfile(profile.name)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{profile.name}</span>
                {activeProfile === profile.name && (
                  <Check className="w-4 h-4 text-green-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 右侧：编辑区 */}
      <div className="flex-1 flex flex-col">
        {profileContent ? (
          <>
            {/* Tab 导航 */}
            <div className="px-4 pt-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex gap-4">
                {(['soul', 'identity', 'user'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`pb-2 text-sm font-medium border-b-2 ${
                      activeTab === tab
                        ? 'text-primary-600 border-primary-600'
                        : 'text-gray-500 border-transparent'
                    }`}
                  >
                    {tab === 'soul' ? 'SOUL.md' : tab === 'identity' ? 'IDENTITY.md' : 'USER.md'}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleSetActive(selectedProfile!)}
                  disabled={activeProfile === selectedProfile}
                  className={`px-3 py-1 text-sm rounded ${
                    activeProfile === selectedProfile
                      ? 'bg-green-100 text-green-700 cursor-default'
                      : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600'
                  }`}
                >
                  {activeProfile === selectedProfile ? '当前使用' : '设为默认'}
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-3 py-1 text-sm bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>

            {/* 编辑器 */}
            <div className="flex-1 p-4">
              <textarea
                value={profileContent[activeTab] || ''}
                onChange={(e) => setProfileContent({ ...profileContent, [activeTab]: e.target.value })}
                className="w-full h-full p-3 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono text-sm resize-none"
                placeholder={`编辑 ${activeTab === 'soul' ? 'SOUL.md' : activeTab === 'identity' ? 'IDENTITY.md' : 'USER.md'}...`}
              />
            </div>

            {/* 删除按钮 */}
            {selectedProfile !== 'default' && selectedProfile !== 'developer' && (
              <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => handleDeleteProfile(selectedProfile!)}
                  className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" /> 删除配置
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            选择一个配置进行编辑
          </div>
        )}
      </div>

      {/* 新建配置弹窗 */}
      {showNewProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-80">
            <h3 className="text-lg font-semibold mb-4">新建配置</h3>
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="配置名称"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewProfile(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                取消
              </button>
              <button
                onClick={handleCreateProfile}
                disabled={!newProfileName.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
