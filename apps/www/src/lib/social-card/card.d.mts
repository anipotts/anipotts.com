/** Types for the plain-Node card painter in card.mjs. */

export declare const CARD_WIDTH: number;
export declare const CARD_HEIGHT: number;
export declare const SAFE_LEFT: number;
export declare const SAFE_RIGHT: number;

export interface CardRequest {
  /** Legacy input; all routes use the canonical brand composition. */
  title?: string | null;
  /** The site name, set as the card's byline. */
  name: string;
  /** Legacy route input; canonical wave composition is shared. */
  seed?: string;
}

export declare function renderCard(request: CardRequest): Buffer;

export declare function cardInkBounds(request: Omit<CardRequest, "seed">): {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
