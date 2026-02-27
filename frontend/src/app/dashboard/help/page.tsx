/**
 * @file page.tsx
 * @description 도움말 페이지. 좌측 토픽 네비게이션 + 우측 마크다운 렌더링.
 *   useI18n()의 locale로 해당 언어 문서를 로드합니다.
 */
'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui';
import { useI18n } from '@/contexts/I18nContext';
import { TOPICS, getDocContent } from '@/docs';
import DocTopicList from './components/DocTopicList';
import MarkdownRenderer from './components/MarkdownRenderer';

export default function HelpPage() {
  const { t, locale } = useI18n();
  const [selectedTopic, setSelectedTopic] = useState(TOPICS[0].id);

  const content = getDocContent(locale, selectedTopic);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Icon name="help" className="text-primary" />
          <span className="tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
            {t('help.title')}
          </span>
          <span className="text-muted-foreground text-sm font-normal ml-1">
            / {t('help.subtitle')}
          </span>
        </h1>
      </div>

      {/* 본문: 좌측 토픽 목록 + 우측 문서 */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        {/* 좌측: 토픽 네비게이션 */}
        <aside className="bg-background-white dark:bg-background-dark rounded-xl border border-border dark:border-border-dark p-4 h-fit lg:sticky lg:top-4">
          <DocTopicList selectedId={selectedTopic} onSelect={setSelectedTopic} />
        </aside>

        {/* 우측: 마크다운 콘텐츠 */}
        <main className="bg-background-white dark:bg-background-dark rounded-xl border border-border dark:border-border-dark p-6 min-h-[400px]">
          <MarkdownRenderer content={content} />
        </main>
      </div>
    </div>
  );
}
