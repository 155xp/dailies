import type { JSX } from "react";
import type { GameId } from "../games";
import type { CardProps } from "./frame";
import { PlaceholderCard } from "./placeholder";
import { Krillion } from "./krillion";
import { EncloseHorse } from "./enclose-horse";
import { Wordle } from "./wordle";
import { Connections } from "./connections";
import { SpellingBee } from "./spelling-bee";

export type { CardProps };

/** One result card per game. Placeholders remain until each real card lands. */
export const CARDS: Record<GameId, (props: CardProps) => JSX.Element> = {
  krillion: Krillion,
  travle: PlaceholderCard,
  "enclose-horse": EncloseHorse,
  wordle: Wordle,
  connections: Connections,
  "spelling-bee": SpellingBee,
  mini: PlaceholderCard,
  globle: PlaceholderCard,
  songless: PlaceholderCard,
};
