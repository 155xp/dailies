import type { JSX } from "react";
import type { GameId } from "../games";
import type { CardProps } from "./frame";
import { PlaceholderCard } from "./placeholder";
import { Krillion } from "./krillion";
import { EncloseHorse } from "./enclose-horse";

export type { CardProps };

/** One result card per game. Placeholders remain until each real card lands. */
export const CARDS: Record<GameId, (props: CardProps) => JSX.Element> = {
  krillion: Krillion,
  travle: PlaceholderCard,
  "enclose-horse": EncloseHorse,
  wordle: PlaceholderCard,
  connections: PlaceholderCard,
  "spelling-bee": PlaceholderCard,
  mini: PlaceholderCard,
  globle: PlaceholderCard,
  songless: PlaceholderCard,
};
