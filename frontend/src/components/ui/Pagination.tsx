/**
 * @file components/ui/Pagination.tsx
 * @description 공통 페이지네이션 컴포넌트 — 첫/이전/다음/끝 버튼 + 페이지 정보
 */

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  showing: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, showing, onPageChange }: PaginationProps) {
  const btn = (label: string, target: number, disabled: boolean) => (
    <button
      onClick={() => onPageChange(target)}
      disabled={disabled}
      className="px-2 py-1 rounded text-xs font-medium border border-border dark:border-border-dark
        bg-surface dark:bg-surface-dark text-text dark:text-white
        hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {label}
    </button>
  );

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border dark:border-border-dark flex-shrink-0">
      <span className="text-xs text-muted-foreground">
        총 {total}건 · {showing}건 표시
      </span>
      <div className="flex items-center gap-1">
        {btn('«', 1, page === 1)}
        {btn('‹', page - 1, page === 1)}
        <span className="px-3 py-1 text-xs text-text dark:text-white">
          {page} / {totalPages}
        </span>
        {btn('›', page + 1, page === totalPages)}
        {btn('»', totalPages, page === totalPages)}
      </div>
    </div>
  );
}
