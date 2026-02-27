/**
 * @file markdown.d.ts
 * @description .md 파일을 문자열로 import 하기 위한 TypeScript 모듈 선언
 */
declare module '*.md' {
  const content: string;
  export default content;
}
