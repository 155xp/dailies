/**
 * The player's Travle route: the cheapest chain of bordering countries from the start to the end that runs
 * through their own guesses, borrowing a shortest-route country only where they never found a way across.
 * Neighbours on the shortest route always connect, so there is always a chain.
 */
export function playerRoute(route: string[], guessed: string[], touches: (a: string, b: string) => boolean) {
  const mine = new Set(guessed);
  const missing = route.slice(1, -1).filter((c) => !mine.has(c));
  const [start, end] = [route[0], route.at(-1)];
  if (start === undefined || end === undefined || route.length < 2) return { path: route, missing };
  const nodes = [...new Set([...route, ...guessed])];
  const step = (a: string, b: string) => Math.abs(route.indexOf(a) - route.indexOf(b)) === 1 && route.includes(a) && route.includes(b);
  const cost = new Map([[start, 0]]);
  const from = new Map<string, string>();
  const done = new Set<string>();
  // Dijkstra over a dozen countries: a guess (or the end) costs 1 to enter, a borrowed route country 100.
  for (let here: string | undefined = start; here !== undefined && here !== end; ) {
    done.add(here);
    for (const n of nodes) {
      if (done.has(n) || !(touches(here, n) || step(here, n))) continue;
      const c = cost.get(here)! + (mine.has(n) || n === end ? 1 : 100);
      if (c >= (cost.get(n) ?? Infinity)) continue;
      cost.set(n, c);
      from.set(n, here);
    }
    here = nodes.filter((n) => !done.has(n) && cost.has(n)).sort((a, b) => cost.get(a)! - cost.get(b)!)[0];
  }
  const path = [end];
  while (path[0] !== start) path.unshift(from.get(path[0]!)!);
  return { path, missing };
}
