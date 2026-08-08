declare global {
  interface Window {
    __slopfilterHarness: {
      appendPost(post: {
        id: string;
        authorHandle: string;
        text: string;
        postedAt: string;
        imageUrl?: string;
      }): void;
      collapseFirstPost(reasons: string[]): void;
      reset(): void;
    };
  }
}

export {};
