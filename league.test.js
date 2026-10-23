import test from 'node:test';import assert from 'node:assert/strict';
// BET-55 · ligue générale : échelons, groupes, saisons, montées et descentes
const L=await import('./league.js');
const mk=(n,echelon,over={})=>Array.from({length:n},(_,i)=>({id:`${over.prefix??''}${echelon}-${i}`,echelon,group:over.group??String.fromCharCode(65+Math.floor(i/20)),points:100-i%20,roi:5,dailyGood:0,joinedAt:'2026-01-01',active:true,qualified:true,protected:false,...over}));
test('l’échelle compte 17 échelons avec leurs chevrons',()=>{
  assert.equal(L.ECHELONS.length,17);assert.equal(L.echelonName(0),'District III');assert.equal(L.echelonName(11),'Pro I');assert.equal(L.echelonName(14),'Élite I');assert.equal(L.echelonName(16),'Master');
  assert.deepEqual([0,1,2,12,13,14].map(L.chevrons),['▴','▴▴','▴▴▴','▴','▴▴','▴▴▴']);assert.equal(L.chevrons(15),'');assert.equal(L.divisionOf(7),'National');assert.equal(L.divisionOf(15),'Champions');
});
test('les effectifs cibles suivent les parts prévues pour 50, 200, 1 000 et 5 000 joueurs',()=>{
  for(const n of [50,200,1000,5000]){const s=L.targetSizes(n);assert.equal(s.reduce((a,b)=>a+b,0),n,'total '+n);assert.ok(s.every((count,i)=>count===0||count>=10||i>=15),'échelon trop petit pour '+n)}
  const big=L.targetSizes(5000),division=d=>big.slice(d*3,d*3+3).reduce((a,b)=>a+b,0);
  assert.equal(big[16],20);assert.equal(big[15],20);assert.ok(Math.abs(division(4)-.06*4960)<=3);assert.ok(Math.abs(division(3)-.12*4960)<=3);assert.ok(Math.abs(division(2)-.18*4960)<=3);assert.ok(Math.abs(division(1)-.24*4960)<=3);
  assert.equal(L.targetSizes(299)[15],0);assert.equal(L.targetSizes(300)[15],20);assert.equal(L.targetSizes(300)[16],0);assert.equal(L.targetSizes(500)[16],20);
});
test('les groupes comptent 10 à 20 joueurs et restent équilibrés en serpentin',()=>{
  for(const n of [10,19,20,21,35,50,200]){const groups=L.makeGroups(Array.from({length:n},(_,i)=>i));assert.equal(groups.reduce((s,g)=>s+g.members.length,0),n);assert.ok(groups.every(g=>g.members.length>=10&&g.members.length<=20),'n='+n)}
  const two=L.makeGroups(Array.from({length:40},(_,i)=>i)).map(g=>g.members.reduce((s,x)=>s+x,0));assert.ok(Math.abs(two[0]-two[1])<=20);assert.deepEqual(L.makeGroups([]),[]);
});
test('le premier classement place tous les joueurs actifs d’un coup',()=>{
  const players=mk(60,null),result=L.closeSeason(players);
  assert.equal(result.moves.length,60);assert.ok(result.moves.every(m=>m.outcome==='PLACE'&&m.to>=0&&m.to<=16));
  assert.ok(result.moves.find(m=>m.groupRank===1).to>=result.moves.find(m=>m.groupRank===60).to);assert.equal(result.groups.reduce((s,g)=>s+g.members.length,0),60);
});
test('un nouveau joueur est plafonné à National III et un inactif sans échelon va en District III',()=>{
  const fresh=mk(200,null),veterans=mk(40,5,{group:'B',prefix:'v'}),idle={id:'idle',echelon:null,active:false,qualified:false,points:0,roi:0,joinedAt:'2026-02-01'};
  const {moves}=L.closeSeason([...fresh,...veterans,idle]),mine=moves.filter(m=>m.from==null&&m.outcome==='PLACE');
  assert.equal(Math.max(...mine.map(m=>m.to)),L.NATIONAL_III);assert.equal(moves.find(m=>m.id==='idle').to,0);assert.equal(moves.find(m=>m.id==='idle').inactive,true);
});
test('la clôture est idempotente',()=>{const players=[...mk(40,3),...mk(40,4,{group:'B',prefix:'x'})];assert.deepEqual(L.closeSeason(players),L.closeSeason(players.map(p=>({...p}))))});
test('à l’intérieur d’une division, les premiers de chaque groupe montent et les derniers descendent',()=>{
  const players=[...mk(40,3,{prefix:'l'}),...mk(40,4),...mk(40,5,{prefix:'u'})],{moves}=L.closeSeason(players),by=Object.fromEntries(moves.map(m=>[m.id,m]));
  assert.equal(by['4-0'].outcome,'PROMU');assert.equal(by['4-20'].outcome,'PROMU');assert.equal(by['4-19'].outcome,'RELEGUE');assert.equal(by['4-39'].outcome,'RELEGUE');
  assert.equal(moves.filter(m=>m.from===4&&m.outcome==='PROMU').length,8);assert.equal(moves.filter(m=>m.from===4&&m.outcome==='RELEGUE').length,8);
  assert.ok(moves.every(m=>!(m.outcome==='PROMU'&&m.to<=m.from)&&!(m.outcome==='RELEGUE'&&m.to>=m.from)));
});
test('montée directe : le champion d’un groupe saute un échelon jusqu’en National',()=>{
  const {moves}=L.closeSeason([...mk(200,0),...mk(20,4,{group:'Z',prefix:'b'})]),champion=moves.find(m=>m.id==='0-0');assert.equal(champion.outcome,'PROMU');assert.equal(champion.to,2);
  const high=L.closeSeason([...mk(20,8),...mk(20,5,{group:'B',prefix:'b'})]).moves.find(m=>m.id==='8-0');assert.ok(high.to<=9);
});
test('personne ne descend sous District III et la saison de découverte protège après une montée de division',()=>{
  const {moves}=L.closeSeason(mk(20,0));assert.ok(moves.every(m=>m.to>=0));assert.equal(moves.find(m=>m.id==='0-19').to,0);
  const protectedLast=mk(20,5).map((p,i)=>i===19?{...p,protected:true}:p),after=L.closeSeason(protectedLast).moves;assert.notEqual(after.find(m=>m.id==='5-19').outcome,'RELEGUE');
  const promotion=L.closeSeason([...mk(20,2),...mk(20,3,{group:'B',prefix:'b'})]).moves.find(m=>m.id==='2-0');assert.equal(promotion.protectedNext,L.divisionIndex(promotion.to)>L.divisionIndex(2));
});
test('un joueur inactif perd un échelon et sort des groupes, un joueur non qualifié ne monte pas',()=>{
  const players=[...mk(20,6),{id:'sleeper',echelon:6,group:'A',points:0,roi:0,dailyGood:0,joinedAt:'2025-01-01',active:false,qualified:false,protected:false}],result=L.closeSeason(players),sleeper=result.moves.find(m=>m.id==='sleeper');
  assert.equal(sleeper.outcome,'INACTIF');assert.equal(sleeper.to,5);assert.equal(sleeper.inactive,true);assert.ok(!result.groups.some(g=>g.members.includes('sleeper')));
  const unqualified=mk(20,6).map((p,i)=>i===0?{...p,qualified:false,points:999}:p),first=L.closeSeason(unqualified).moves.find(m=>m.id==='6-0');assert.notEqual(first.outcome,'PROMU');
});
test('passage de division : 3 premiers montent, le 4e joue un barrage contre le 4e en partant du bas',()=>{
  const players=[...mk(20,11),...mk(20,12,{group:'B',prefix:'h'})],run=barrage=>Object.fromEntries(L.closeSeason(players,{barrage}).moves.map(m=>[m.id,m]));
  const won=run({'11-3':10,'h12-16':5});
  assert.deepEqual(['11-0','11-1','11-2'].map(id=>won[id].to),[12,12,12]);assert.deepEqual(['h12-19','h12-18','h12-17'].map(id=>won[id].to),[11,11,11]);
  assert.equal(won['11-3'].to,12);assert.equal(won['h12-16'].to,11);assert.ok(won['11-0'].protectedNext);
  const lost=run({'11-3':1,'h12-16':5});assert.equal(lost['11-3'].to,11);assert.equal(lost['h12-16'].to,12);
});
test('les échelons trop petits sont fusionnés et les échelons fermés se vident vers Élite I',()=>{
  const {moves}=L.closeSeason([...mk(40,4),...mk(5,9,{group:'B',prefix:'s'})]);assert.ok(moves.filter(m=>m.id.startsWith('s')).every(m=>m.to<9));
  const crowd=L.closeSeason([...mk(30,15),...mk(30,14,{group:'B',prefix:'e'})]).moves;assert.ok(crowd.every(m=>m.to<=14),'Champions fermé sous 300 joueurs actifs');
});
test('les archives mensuelles restent lisibles et le mois est calculé à Paris et le barrage se joue sur le dernier week-end',()=>{
  assert.equal(L.monthKey('2026-10-31T23:30:00Z'),'2026-11');assert.equal(L.monthKey('2026-10-31T22:30:00Z'),'2026-10');assert.equal(L.nextSeason('2026-12'),'2027-01');assert.equal(L.previousSeason('2027-01'),'2026-12');
  assert.deepEqual(L.lastWeekend('2026-10'),['2026-10-24','2026-10-25']);assert.deepEqual(L.lastWeekend('2026-11'),['2026-11-28','2026-11-29']);assert.deepEqual(L.lastWeekend('2026-05'),['2026-05-30','2026-05-31']);
});
test('le classement de saison additionne les points, donne la forme et applique la règle des 50 % de défis',()=>{
  const members=[{user_id:'a',group_id:1,joined_at:'2026-01-01'},{user_id:'b',group_id:1,joined_at:'2026-01-02'},{user_id:'c',group_id:1,joined_at:'2025-01-01'},{user_id:'d',group_id:null,joined_at:'2026-01-01'}];
  const entries=[{user_id:'a',points:9,settled_at:'2026-10-01'},{user_id:'a',points:-10,settled_at:'2026-10-02'},{user_id:'a',points:15,settled_at:'2026-10-03'},{user_id:'b',points:14,settled_at:'2026-10-01'},{user_id:'c',points:14,settled_at:'2026-10-01'}];
  const rows=L.computeStandings({season:'2026-10',members,entries,participation:{a:{played:3,good:2,offered:4},b:{played:1,good:1,offered:4}},previous:{a:{rank:2,snapshot_date:'2026-10-02'},b:{rank:1,snapshot_date:'2026-10-03',prev_rank:3}},today:'2026-10-03'}),by=Object.fromEntries(rows.map(r=>[r.user_id,r]));
  assert.equal(by.a.points,14);assert.equal(by.a.form,'VDV');assert.equal(by.a.picks,3);assert.equal(by.a.wins,2);assert.equal(by.a.qualified,true);assert.equal(by.b.qualified,false);
  assert.equal(by.b.rank,1);assert.equal(by.c.rank,2);assert.equal(by.a.rank,3);assert.equal(by.d.rank,1);assert.equal(by.d.picks,0);
  assert.equal(by.a.prev_rank,2);assert.equal(by.a.snapshot_date,'2026-10-03');assert.equal(by.b.prev_rank,3);assert.equal(by.b.snapshot_date,'2026-10-03');
});
const {planClosure,unlockPlan}=await import('./scripts/league-engine.mjs');
test('les déblocages de division restent acquis, la couronne est exclusive au Master',()=>{
  assert.deepEqual(unlockPlan({from:5,to:6}),{unlocks:['socle argent'],revoke:[]});assert.deepEqual(unlockPlan({from:null,to:10}),{unlocks:['socle argent','maillot or'],revoke:[]});
  assert.deepEqual(unlockPlan({from:15,to:16}),{unlocks:['couronne'],revoke:[]});assert.deepEqual(unlockPlan({from:16,to:15}),{unlocks:[],revoke:['couronne']});assert.deepEqual(unlockPlan({from:9,to:8}),{unlocks:[],revoke:[]});
});
test('le plan de clôture d’une saison est complet, idempotent et rattache chaque joueur à un échelon et un groupe',()=>{
  const ids=Array.from({length:40},(_,i)=>`u${i}`),players=ids.map((id,i)=>({user_id:id,echelon:4,joined_at:'2026-01-01',protected:false})),standings=ids.map((id,i)=>({user_id:id,points:100-i,roi:5,daily_good:0,picks:i===39?0:5,qualified:true}));
  const groups=[{id:1,label:'A'},{id:2,label:'B'}],groupMembers=ids.map((id,i)=>({user_id:id,group_id:i<20?1:2})),input={season:'2026-10',players,standings,groups,groupMembers,weekendPoints:{}};
  const plan=planClosure(input);
  assert.equal(plan.next,'2026-11');assert.equal(plan.results.length,40);assert.deepEqual(plan.results,planClosure(structuredClone(input)).results);
  assert.equal(plan.results.find(r=>r.user_id==='u39').outcome,'INACTIF');assert.equal(plan.results.find(r=>r.user_id==='u39').inactive,true);
  assert.ok(plan.groups.every(g=>g.members.length>=1)&&plan.groups.flatMap(g=>g.members).length===39);assert.ok(!plan.groups.some(g=>g.members.includes('u39')));
  assert.ok(plan.results.filter(r=>r.outcome==='PROMU').every(r=>r.to_echelon>r.from_echelon));
});
test('libellé de fin de saison et déblocages de division',()=>{assert.equal(L.outcomeLabel({outcome:'PROMU'}),'PROMU');assert.equal(L.outcomeLabel({outcome:'RELEGUE'}),'RELÉGUÉ');assert.equal(L.outcomeLabel({outcome:'MAINTENU'}),'MAINTENU');assert.deepEqual(L.unlocksFor(6),['couronne']);assert.deepEqual(L.unlocksFor(0),[])});

test('BET-78 : saison de football, limites de Paris et archives',()=>{
  assert.equal(L.seasonKey('2026-06-30T21:59:59Z'),'2025-2026');
  assert.equal(L.seasonKey('2026-06-30T22:00:00Z'),'2026-2027');
  assert.equal(L.seasonKey('2027-02-01T00:00:00Z'),'2026-2027');
  assert.equal(L.nextSeason('2026-2027'),'2027-2028');assert.equal(L.previousSeason('2026-2027'),'2025-2026');
  assert.deepEqual(L.seasonDates('2026-2027'),{start:'2026-07-01',end:'2027-06-30'});
  assert.deepEqual(L.lastWeekend('2026-2027'),['2027-06-26','2027-06-27']);
  assert.equal(L.seasonLabel('2026-2027'),'Saison 2026 / 2027');assert.match(L.seasonLabel('2026-10'),/octobre 2026/);
});
