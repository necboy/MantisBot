import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SkillManagementSection } from './SkillManagementSection';
import { ModelConfigSection } from './ModelConfigSection';
import { ProfileManagementSection } from './ProfileManagementSection';
import { EvolutionSection } from './EvolutionSection';
import { AllowedPathsSection } from './AllowedPathsSection';
import { ChannelManagementSection } from './ChannelManagementSection';
import { EmailConfigSection } from './EmailConfigSection';
import { AuthSettingsSection } from './AuthSettingsSection';
import { InstallSkillModal } from './InstallSkillModal';
import { authFetch } from '../utils/auth';

interface Skill {
  name: string;
  description: string;
  enabled: boolean;
  source: string;
  filePath: string;
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [activeTab, setActiveTab] = useState<'skills' | 'models' | 'profiles' | 'evolutions' | 'paths' | 'channels' | 'email' | 'auth'>('skills');
  const [activeProfile, setActiveProfile] = useState('default');
  const [installModalOpen, setInstallModalOpen] = useState(false);

  // Fetch skills on mount
  useEffect(() => {
    if (isOpen) {
      fetchSkills();
    }
  }, [isOpen]);

  async function fetchSkills() {
    try {
      const res = await authFetch('/api/skills');
      if (!res.ok) throw new Error('Failed to fetch skills');
      const data = await res.json();
      setSkills(data.skills);
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  }

  async function reloadSkills() {
    setReloading(true);
    try {
      const res = await authFetch('/api/skills/reload', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reload skills');
      await fetchSkills();
    } catch (err) {
      console.error('Failed to reload skills:', err);
    } finally {
      setReloading(false);
    }
  }

  async function toggleSkill(skillName: string) {
    setLoading(true);
    try {
      const res = await authFetch(`/api/skills/${skillName}/toggle`, {
        method: 'POST'
      });
      if (!res.ok) throw new Error('Failed to toggle skill');
      const data = await res.json();

      // Update local state
      setSkills(prev => prev.map(s =>
        s.name === skillName ? { ...s, enabled: data.enabled } : s
      ));
    } catch (err) {
      console.error('Failed to toggle skill:', err);
      // Revert on error by refetching
      await fetchSkills();
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {t('settings.title')}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-3 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('skills')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'skills'
                  ? 'text-primary-600 border-primary-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t('settings.skillManagement')}
            </button>
            <button
              onClick={() => setActiveTab('models')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'models'
                  ? 'text-primary-600 border-primary-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t('settings.modelConfig')}
            </button>
            <button
              onClick={() => setActiveTab('profiles')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'profiles'
                  ? 'text-primary-600 border-primary-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t('settings.agentProfile')}
            </button>
            <button
              onClick={() => setActiveTab('evolutions')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'evolutions'
                  ? 'text-primary-600 border-primary-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t('settings.evolution')}
            </button>
            <button
              onClick={() => setActiveTab('paths')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'paths'
                  ? 'text-primary-600 border-primary-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t('settings.allowedPaths')}
            </button>
            <button
              onClick={() => setActiveTab('channels')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'channels'
                  ? 'text-primary-600 border-primary-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t('settings.channelManagement')}
            </button>
            <button
              onClick={() => setActiveTab('email')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'email'
                  ? 'text-primary-600 border-primary-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {t('settings.emailConfig') || '邮件配置'}
            </button>
            <button
              onClick={() => setActiveTab('auth')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'auth'
                  ? 'text-primary-600 border-primary-600'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              访问鉴权
            </button>
          </div>
        </div>

        {/* Content Area */}
        {activeTab === 'skills' ? (
          <SkillManagementSection
            skills={skills}
            searchQuery={searchQuery}
            loading={loading}
            reloading={reloading}
            onToggle={toggleSkill}
            onSearch={setSearchQuery}
            onReload={reloadSkills}
            onInstall={() => setInstallModalOpen(true)}
          />
        ) : activeTab === 'models' ? (
          <ModelConfigSection />
        ) : activeTab === 'profiles' ? (
          <ProfileManagementSection
            activeProfile={activeProfile}
            onProfileChange={setActiveProfile}
          />
        ) : activeTab === 'paths' ? (
          <AllowedPathsSection />
        ) : activeTab === 'channels' ? (
          <ChannelManagementSection isOpen={activeTab === 'channels'} />
        ) : activeTab === 'email' ? (
          <EmailConfigSection />
        ) : activeTab === 'auth' ? (
          <AuthSettingsSection />
        ) : (
          <EvolutionSection />
        )}
      </div>

      <InstallSkillModal
        isOpen={installModalOpen}
        onClose={() => setInstallModalOpen(false)}
        onInstalled={() => fetchSkills()}
      />
    </div>
  );
}
