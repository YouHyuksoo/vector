/**
 * @file MarkdownRenderer.tsx
 * @description 마크다운 문자열을 Tailwind 다크모드 스타일이 적용된 HTML로 렌더링하는 컴포넌트.
 *   react-markdown + remark-gfm(테이블/체크리스트) + rehype-slug(헤딩 앵커)를 사용합니다.
 */
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import type { Components } from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
}

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold mt-8 mb-4 pb-2 border-b border-border dark:border-border-dark text-text dark:text-white">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold mt-6 mb-3 text-text dark:text-white">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold mt-4 mb-2 text-text dark:text-gray-200">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed text-text-secondary dark:text-gray-300">{children}</p>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-inside mb-3 space-y-1 text-text-secondary dark:text-gray-300">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-inside mb-3 space-y-1 text-text-secondary dark:text-gray-300">{children}</ol>
  ),
  li: ({ children }) => <li className="ml-2">{children}</li>,
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-3 text-sm overflow-x-auto whitespace-pre text-text dark:text-gray-200">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-gray-100 dark:bg-gray-700 text-pink-600 dark:text-pink-400 px-1.5 py-0.5 rounded text-sm">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="mb-3">{children}</pre>,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3">
      <table className="min-w-full border border-border dark:border-border-dark text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="border border-border dark:border-border-dark px-3 py-2 text-left font-semibold text-text dark:text-white">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-border dark:border-border-dark px-3 py-2 text-text-secondary dark:text-gray-300">
      {children}
    </td>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-primary/40 pl-4 my-3 italic text-text-secondary dark:text-gray-400">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-border dark:border-border-dark" />,
  strong: ({ children }) => (
    <strong className="font-semibold text-text dark:text-white">{children}</strong>
  ),
};

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]} components={components}>
      {content}
    </ReactMarkdown>
  );
}
