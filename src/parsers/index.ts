import type { DailyRecord, RecordParser } from "../record";
import { parseConnections } from "./connections";
import { parseEncloseHorse } from "./enclose-horse";
import { parseGloble } from "./globle";
import { parseKrillion } from "./krillion";
import { parseMini } from "./mini";
import { parseSongless } from "./songless";
import { parseSpamle } from "./spamle";
import { parseSpellingBee } from "./spelling-bee";
import { parseTravle } from "./travle";
import { parseWordle } from "./wordle";

export const PARSERS: { [G in DailyRecord["game"]]: RecordParser<G> } = {
  krillion: parseKrillion,
  travle: parseTravle,
  "enclose-horse": parseEncloseHorse,
  wordle: parseWordle,
  connections: parseConnections,
  "spelling-bee": parseSpellingBee,
  mini: parseMini,
  globle: parseGloble,
  songless: parseSongless,
  spamle: parseSpamle,
};
