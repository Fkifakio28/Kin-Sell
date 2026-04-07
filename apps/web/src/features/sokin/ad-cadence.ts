import type { SoKinApiFeedPost } from '../../lib/api-client';

export type SoKinAdContext = {
  page: 'sokin';
  postIndex: number;
  cadence?: number;
};

export type SoKinAdSlot = {
  page: 'sokin';
  afterPostIndex: number;
  sequence: number;
  slotKey: string;
};

export type SoKinFeedItem =
  | { type: 'post'; post: SoKinApiFeedPost }
  | { type: 'ad'; slot: SoKinAdSlot };

const DEFAULT_CADENCE = 4;

/**
 * Point d'extension unique pour la cadence publicitaire So-Kin.
 * Aujourd'hui: simple cadence fixe (4).
 * Demain: cadence adaptative, A/B tests, scoring, filtrage intelligent.
 */
export function getNextAdSlot(context: SoKinAdContext): SoKinAdSlot | null {
  const cadence = Math.max(1, context.cadence ?? DEFAULT_CADENCE);
  const postPosition = context.postIndex + 1;
  if (postPosition % cadence !== 0) return null;

  const sequence = Math.floor(postPosition / cadence);
  return {
    page: context.page,
    afterPostIndex: context.postIndex,
    sequence,
    slotKey: `${context.page}-slot-${sequence}`,
  };
}

export function buildSoKinFeedItems(posts: SoKinApiFeedPost[], cadence = DEFAULT_CADENCE): SoKinFeedItem[] {
  const items: SoKinFeedItem[] = [];

  posts.forEach((post, postIndex) => {
    items.push({ type: 'post', post });

    const slot = getNextAdSlot({
      page: 'sokin',
      postIndex,
      cadence,
    });
    if (slot) {
      items.push({ type: 'ad', slot });
    }
  });

  return items;
}
