/**
 * @file DocTopicList.tsx
 * @description 도움말 좌측 토픽 네비게이션 목록.
 *   "시스템 가이드"와 "메뉴별 사용설명" 두 그룹으로 나뉘며, 아이콘 + 제목 + 선택 하이라이트.
 */
'use client';

import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import { TOPICS, type DocTopic } from '@/docs';

interface DocTopicListProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

export default function DocTopicList({ selectedId, onSelect }: DocTopicListProps) {
  const { t } = useI18n();

  const guideTopics = TOPICS.filter(tp => tp.group === 'guide');
  const menuTopics = TOPICS.filter(tp => tp.group === 'menu');

  const renderItem = (topic: DocTopic) => {
    const active = topic.id === selectedId;
    return (
      <button
        key={topic.id}
        onClick={() => onSelect(topic.id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-200
          ${active
            ? 'bg-primary/10 text-primary border border-primary/20 font-bold'
            : 'text-text dark:text-white hover:bg-surface dark:hover:bg-surface-dark'
          }`}
      >
        <Icon name={topic.icon} size="sm" className={active ? 'text-primary' : 'text-text-secondary'} />
        <span className="text-sm">{t(topic.labelKey)}</span>
      </button>
    );
  };

  return (
    <nav className="space-y-4">
      {/* 시스템 가이드 그룹 */}
      <div>
        <p className="text-xs font-bold text-text-secondary uppercase tracking-wider px-3 mb-2">
          {t('help.groupGuide')}
        </p>
        <div className="space-y-1">{guideTopics.map(renderItem)}</div>
      </div>

      {/* 메뉴별 사용설명 그룹 */}
      <div>
        <p className="text-xs font-bold text-text-secondary uppercase tracking-wider px-3 mb-2">
          {t('help.groupMenu')}
        </p>
        <div className="space-y-1">{menuTopics.map(renderItem)}</div>
      </div>
    </nav>
  );
}
