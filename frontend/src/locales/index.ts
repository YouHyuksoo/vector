/**
 * @file src/locales/index.ts
 * @description i18n 번역 시스템 타입 정의 및 유틸리티
 *
 * 초보자 가이드:
 * 1. **키 구조**: 'nav.dashboard' 형태의 점 구분 키로 번역 텍스트 접근
 * 2. **언어 추가**: ko.json/en.json 같은 형식으로 새 JSON 파일 추가 후 locales 맵에 등록
 */

import ko from './ko.json';
import en from './en.json';

export type Locale = 'ko' | 'en';

export type TranslationMap = typeof ko;

export const locales: Record<Locale, TranslationMap> = { ko, en };

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: 'KO',
  en: 'EN',
};

/** 점 구분 키로 중첩 객체 값 조회 (예: 'nav.dashboard') */
export function getNestedValue(obj: Record<string, any>, path: string): string {
  const keys = path.split('.');
  let current: any = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return path;
    current = current[key];
  }
  return typeof current === 'string' ? current : path;
}
