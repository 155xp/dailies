import type { JSX } from "react";
import type { GameId } from "../games";
import { PlaceholderCard, type CardProps } from "./placeholder";

export type { CardProps };

/** One result card per game. Each entry is replaced by `./<game>.tsx` as the real cards land. */
export const CARDS: Record<GameId, (props: CardProps) => JSX.Element> = {
  krillion: PlaceholderCard,
  travle: PlaceholderCard,
  "enclose-horse": PlaceholderCard,
  wordle: PlaceholderCard,
  connections: PlaceholderCard,
  "spelling-bee": PlaceholderCard,
  mini: PlaceholderCard,
  globle: PlaceholderCard,
  songless: PlaceholderCard,
};
