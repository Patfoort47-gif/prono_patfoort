// BET-76 : bilan personnel complet. Les anciens paris restent privés et ne créent pas de points de ligue.
export function profileHistory(history = []) {
  const ids = new Set(), bets = history.filter(bet => {
    if (!bet.id) return true;
    if (ids.has(bet.id)) return false;
    ids.add(bet.id); return true;
  });
  const settled = bets.filter(bet => ['won', 'lost'].includes(bet.status));
  const staked = settled.reduce((sum, bet) => sum + (Number(bet.stake) || 0), 0);
  const returned = settled.reduce((sum, bet) => sum + Number(bet.returnAmount ?? bet.payout ?? (bet.status === 'won' ? Number(bet.stake) * Number(bet.odds) : 0)), 0);
  const wins = settled.filter(bet => bet.status === 'won').length;
  return { total: bets.length, settled: settled.length, wins, pending: bets.filter(bet => bet.status === 'pending').length, void: bets.filter(bet => bet.status === 'void').length, legacy: bets.filter(bet => bet.legacy).length, staked, returned, profit: returned - staked, roi: staked ? (returned - staked) / staked * 100 : null, winrate: settled.length ? wins / settled.length * 100 : null, form: settled.slice().sort((a, b) => new Date(b.date ?? b.placed_at) - new Date(a.date ?? a.placed_at)).slice(0, 10).map(bet => bet.status === 'won' ? 'V' : 'D').join('') };
}

// Pagination stable : aucune coupure silencieuse aux 300 derniers paris.
export async function readHistoryPages(query, size = 500) {
  const rows = [];
  for (let offset = 0; ; offset += size) {
    const { data, error } = await query().range(offset, offset + size - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < size) return { data: rows, error: null };
  }
}
