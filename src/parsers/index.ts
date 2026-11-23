import type { GameId, Parser } from "../types";
import { parseConnections } from "./connections";
import { parseEncloseHorse } from "./enclose-horse";
import { parseGloble } from "./globle";
import { parseKrillion } from "./krillion";
import { parseMini } from "./mini";
import { parseSongless } from "./songless";
import { parseSpellingBee } from "./spelling-bee";
import { parseTravle } from "./travle";
import { parseWordle } from "./wordle";

export const PARSERS: Record<GameId, Parser> = {
  krillion: parseKrillion,
  travle: parseTravle,
  "enclose-horse": parseEncloseHorse,
  wordle: parseWordle,
  connections: parseConnections,
  "spelling-bee": parseSpellingBee,
  mini: parseMini,
  globle: parseGloble,
  songless: parseSongless,
};
