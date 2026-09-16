/** Types for the plain-Node card painter in card.mjs. */

export declare const CARD_WIDTH: number;
export declare const CARD_HEIGHT: number;
export declare const SAFE_LEFT: number;
export declare const SAFE_RIGHT: number;

export interface CardRequest {
  /** The essay title, or null for the site card. */
  title?: string | null;
  /** The site name, set as the card's byline. */
  name: string;
  /** Chooses the wave composition; stable per route. */
  seed: string;
}

export declare function renderCard(request: CardRequest): Buffer;

export declare function cardInkBounds(request: Omit<CardRequest, "seed">): {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
