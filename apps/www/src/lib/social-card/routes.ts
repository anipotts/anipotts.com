/** Where each route's social card lives, shared by the layout and the
 * build-time endpoint so a page can never point at a card that is not made. */

export const SITE_CARD = "site";

export function writingCard(slug: string): string {
  return `writing-${slug}`;
}

export function cardPath(card: string): string {
  return `/social/${card}.png`;
}

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
