import { describe, expect, it } from 'vitest';
import { currentArc, emptyCampaign } from './campaign';
import type { ArcStatus } from './types';

const withArcs = (...status: ArcStatus[]) => ({
  ...emptyCampaign(),
  arcs: status.map((s, i) => ({ id: `a${i}`, title: `Arco ${i + 1}`, summary: '', status: s })),
});

describe('currentArc', () => {
  it('sem arcos, nenhum', () => {
    expect(currentArc(emptyCampaign())).toBeUndefined();
  });
  it('prefere o arco em andamento', () => {
    expect(currentArc(withArcs('concluido', 'planejado', 'andamento'))?.id).toBe('a2');
  });
  it('sem andamento, o primeiro planejado', () => {
    expect(currentArc(withArcs('concluido', 'planejado', 'planejado'))?.id).toBe('a1');
  });
  it('tudo concluído, o último', () => {
    expect(currentArc(withArcs('concluido', 'concluido'))?.id).toBe('a1');
  });
});
