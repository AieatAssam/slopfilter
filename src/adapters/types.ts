import type { Post } from '@/core/post';

export interface SelectorCheckResult {
  ok: boolean;
  failedSelectorIds: readonly string[];
}

export interface ProfileStats {
  handle: string;
  joinDate: number | null;
  postCount: number | null;
}

export interface PlatformAdapter {
  readonly platform: 'x';
  readonly selectorContractVersion: string;
  selfTest(root: ParentNode): SelectorCheckResult;
  selfTestFeed(root: ParentNode): SelectorCheckResult;
  findTimelineContainer(root: ParentNode): Element | null;
  findPostElements(container: ParentNode): readonly Element[];
  extractPost(element: Element): Post | null;
  readProfileStats?(root: ParentNode): ProfileStats | null;
}
