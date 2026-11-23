import type { JSX } from "react";
import type { GameId } from "../games";
import { Connections } from "./connections";
import { EncloseHorse } from "./enclose-horse";
import type { CardProps } from "./frame";
import { Globle } from "./globle";
import { Krillion } from "./krillion";
import { Mini } from "./mini";
import { Songless } from "./songless";
import { SpellingBee } from "./spelling-bee";
import { Travle } from "./travle";
import { Wordle } from "./wordle";

export type { CardProps };

/** One result card per game. */
export const CARDS: Record<GameId, (props: CardProps) => JSX.Element> = {
  krillion: Krillion,
  travle: Travle,
  "enclose-horse": EncloseHorse,
  wordle: Wordle,
  connections: Connections,
  "spelling-bee": SpellingBee,
  mini: Mini,
  globle: Globle,
  songless: Songless,
};
