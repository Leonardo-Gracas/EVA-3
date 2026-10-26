// Tokens do mapa como o mestre vê: todos, com os ocultos marcados.
import type { BattleMap, TableState } from '../../model/types';
import { isTokenTurn, tokenInfo } from '../../store/maps';
import type { CanvasToken } from './MapCanvas';

export function gmTokens(s: TableState, m: BattleMap): CanvasToken[] {
  const out: CanvasToken[] = [];
  for (const t of Object.values(m.tokens)) {
    const info = tokenInfo(s, t);
    if (!info) continue;
    out.push({
      id: t.id, x: t.x, y: t.y, name: info.name, side: info.side,
      ...(info.avatar ? { avatar: info.avatar } : {}),
      ...(info.category ? { category: info.category } : {}),
      turn: isTokenTurn(s, m, t),
      hidden: info.hidden,
      ...(t.trail ? { trail: t.trail } : {}),
    });
  }
  return out;
}
