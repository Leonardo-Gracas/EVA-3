// O que os conjuntos de itens e de ameaças têm em comum: casar pelo nome com o que
// já está na mesa e listar o que dá para desimportar.

/** Nome comparável: sem espaços nas pontas e sem diferença de maiúsculas. */
export const nameKey = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

export interface CatalogSet<T extends { name: string }> {
  id: string;
  name: string;
  description: string;
  items: T[];
}

export interface SetRemoval {
  /** Id na mesa (item da biblioteca ou ameaça). */
  id: string;
  name: string;
  /** Diferente da versão do conjunto: editado pelo mestre ou algo próprio de mesmo nome. */
  changed: boolean;
  /** Outros conjuntos que também têm isto e estão (ao menos em parte) na mesa. */
  alsoIn: string[];
}

/** Sai por padrão só o que está igual ao conjunto e não é de outro conjunto em uso. */
export const removableByDefault = (r: SetRemoval) => !r.changed && r.alsoIn.length === 0;

/** O que o conjunto `setId` tem na mesa (pelo nome), para desimportar. */
export function installedInSet<T extends { name: string }, L extends { id: string; name: string }>(
  have: Record<string, L>, sets: Array<CatalogSet<T>>, setId: string, same: (have: L, it: T) => boolean,
): SetRemoval[] {
  const set = sets.find((s) => s.id === setId);
  if (!set) return [];
  const byName = new Map(Object.values(have).map((x) => [nameKey(x.name), x]));
  // Conjunto em uso: tem na mesa algo só dele (o que é de vários conjuntos não diz de qual veio).
  const count = new Map<string, number>();
  for (const s of sets) for (const k of new Set(s.items.map((i) => nameKey(i.name)))) count.set(k, (count.get(k) ?? 0) + 1);
  const mine = new Set(set.items.map((i) => nameKey(i.name)));
  const inUse = sets.filter((s) => {
    if (s.id === setId) return false;
    const own = s.items.filter((i) => count.get(nameKey(i.name)) === 1);
    // Sem nada só dele: vale qualquer item que não seja deste conjunto.
    return (own.length ? own : s.items.filter((i) => !mine.has(nameKey(i.name)))).some((i) => byName.has(nameKey(i.name)));
  });
  const out: SetRemoval[] = [];
  for (const it of set.items) {
    const x = byName.get(nameKey(it.name));
    if (!x || out.some((r) => r.id === x.id)) continue;
    out.push({
      id: x.id,
      name: x.name,
      changed: !same(x, it),
      alsoIn: inUse.filter((s) => s.items.some((i) => nameKey(i.name) === nameKey(it.name))).map((s) => s.name),
    });
  }
  return out;
}
