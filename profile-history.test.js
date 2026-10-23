import test from 'node:test';
import assert from 'node:assert/strict';
import { profileHistory, readHistoryPages } from './profile-history.js';
test('BET-76 : historique certifié et ancien sans doublon ni remboursement dans le ROI', () => {
  const won = { id: 'a', status: 'won', stake: 10, returnAmount: 30, date: '2026-10-01' };
  const result = profileHistory([won, won, { legacy: true, status: 'lost', stake: 20, date: '2026-10-02' }, { status: 'pending', stake: 100 }, { status: 'void', stake: 100, returnAmount: 100 }]);
  assert.equal(result.total, 4); assert.equal(result.settled, 2); assert.equal(result.roi, 0); assert.equal(result.winrate, 50); assert.equal(result.form, 'DV'); assert.equal(result.legacy, 1);
  assert.equal(profileHistory().roi, null);
});
test('BET-76 : pagination au-delà de 300 paris et propagation des erreurs', async () => {
  const data = Array.from({ length: 1200 }, (_, id) => ({ id }));
  const result = await readHistoryPages(() => ({ range: async (a, b) => ({ data: data.slice(a, b + 1) }) }));
  assert.deepEqual(result.data, data);
  const error = { message: 'indisponible' };
  assert.equal((await readHistoryPages(() => ({ range: async () => ({ error }) }))).error, error);
});
