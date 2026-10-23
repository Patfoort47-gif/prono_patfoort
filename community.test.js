import test from 'node:test';import assert from 'node:assert/strict';
// BET-61 · ligues privées : règles pures (les limites et le transfert sont aussi vérifiés côté SQL)
const C=await import('./community.js');
test('le code d’invitation est normalisé : casse, tiret et espaces tolérés, caractères ambigus refusés',()=>{
  assert.equal(C.normalizeCode('BM-AB2C'),'BM-AB2C');assert.equal(C.normalizeCode(' bm-ab2c '),'BM-AB2C');assert.equal(C.normalizeCode('bmab2c'),'BM-AB2C');
  for(const bad of ['BM-AB0C','BM-AB1C','BM-ABIC','BM-ABOC','BM-AB2','BM-AB2CD','XX-AB2C','',null,undefined,'BM-'])assert.equal(C.normalizeCode(bad),null,String(bad));
});
test('le lien direct #ligue-privee-BM-XXXX est lu et normalisé',()=>{
  assert.equal(C.parsePrivateHash('#ligue-privee-BM-AB2C'),'BM-AB2C');assert.equal(C.parsePrivateHash('#ligue-privee-bm-ab2c'),'BM-AB2C');assert.equal(C.parsePrivateHash('#ligue-privee-nope'),null);assert.equal(C.parsePrivateHash('#communaute'),null);assert.equal(C.parsePrivateHash(''),null);
  assert.equal(C.privateLink('BM-AB2C','https://x.github.io/app/'),'https://x.github.io/app/#ligue-privee-BM-AB2C');
});
test('limites : ligues illimitées par joueur, 50 membres par ligue, nom de 3 à 30 caractères',()=>{
  assert.equal(C.canCreateOrJoin(4),true);assert.equal(C.canCreateOrJoin(5000),true);assert.equal(C.isFull(49),false);assert.equal(C.isFull(50),true);
  assert.equal(C.validLeagueName('ab'),false);assert.equal(C.validLeagueName('  abc  '),true);assert.equal(C.validLeagueName('x'.repeat(31)),false);assert.equal(C.validLeagueName(null),false);
});
test('le propriétaire qui quitte transmet la ligue au plus ancien membre, le dernier qui part la supprime',()=>{
  const members=[{user_id:'b',joined_at:'2026-10-02'},{user_id:'a',joined_at:'2026-10-01'},{user_id:'c',joined_at:'2026-10-03'},{user_id:'d',joined_at:'2026-10-02'}];
  assert.equal(C.nextOwner(members,'a'),'b');assert.equal(C.nextOwner(members,'b'),'a');assert.equal(C.nextOwner([{user_id:'a',joined_at:'2026-10-01'}],'a'),null);assert.equal(C.nextOwner([],'a'),null);
});
test('12 emblèmes proposés, un emblème inconnu retombe sur le ballon',()=>{assert.equal(C.PRIVATE_EMBLEMS.length,12);assert.equal(C.emblemOf('crown'),'👑');assert.equal(C.emblemOf('???'),'⚽')});
// BET-60 · fil d'activité, suggestions
const F=await import('./community.js'),M2=await import('./model.js');
test('le fil parle français et n’affiche jamais de montant : aucune mise, aucune bankroll dans les phrases',()=>{
  const texts=[['combo-win',{odds:7.5,legs:3}],['promotion',{to:12}],['title',{league:'Ligue des champions'}],['badge',{badge:'streak-5'}],['level',{level:50}],['private-join',{}],['overtake',{rank:3}],['overtake',{rank:1}],['inconnu',{}]].map(([k,p])=>F.activityText(k,p,'Alice'));
  assert.deepEqual(texts,['Alice a gagné un combiné de 3 matchs à la cote 7.50','Alice est promu en Élite III','Alice est champion de Ligue des champions','Alice a obtenu le trophée « Série de 5 »','Alice passe niveau 50','Alice a rejoint une ligue privée','Alice grimpe à la 3e place de son groupe','Alice grimpe à la 1re place de son groupe','Alice a une nouvelle activité']);
  assert.ok(texts.every(t=>!/€|euro|mise|bankroll/i.test(t)));
});
test('les événements du fil : combiné gagné à 5,00 ou plus, montée, titre, trophée, paliers de niveau tous les 50, ligue privée, dépassement',()=>{
  const now=new Date('2026-10-22T12:00:00Z'),old='2026-09-01T10:00:00Z',fresh='2026-10-21T10:00:00Z',rows=F.planActivities({now,bets:[{id:'b1',user_id:'a',bet_type:'combined',odds:6,status:'won',settled_at:fresh,legs:4},{id:'b2',user_id:'a',bet_type:'combined',odds:4.9,status:'won',settled_at:fresh},{id:'b3',user_id:'a',bet_type:'single',odds:9,status:'won',settled_at:fresh},{id:'b4',user_id:'a',bet_type:'combined',odds:9,status:'lost',settled_at:fresh},{id:'b5',user_id:'a',bet_type:'combined',odds:9,status:'won',settled_at:old}],
    seasonResults:[{season:'2026-09',user_id:'a',outcome:'PROMU',to_echelon:12,created_at:fresh},{season:'2026-09',user_id:'b',outcome:'MAINTENU',to_echelon:3,created_at:fresh}],titles:[{league_id:'ldc',league_name:'Ligue des champions',season:'2026-27',user_id:'a',kind:'champion',awarded_at:fresh},{league_id:'ldc',season:'2026-27',user_id:'b',kind:'top1',awarded_at:fresh}],badges:[{user_id:'a',badge:'streak-5',earned_at:fresh},{user_id:'a',badge:'first-pick',earned_at:old}],
    xpMap:{a:M2.totalXpForLevel(120),b:M2.totalXpForLevel(30)},privateJoins:[{user_id:'a',league_id:'L1',joined_at:fresh}],standings:[{user_id:'a',season:'2026-10',rank:2,prev_rank:5,picks:4},{user_id:'b',season:'2026-10',rank:5,prev_rank:5,picks:4},{user_id:'c',season:'2026-10',rank:1,prev_rank:2,picks:0}]});
  const keys=rows.map(r=>`${r.actor_id}:${r.event_key}`).sort();
  assert.deepEqual(keys,['a:badge:streak-5','a:combo:b1','a:level:100','a:overtake:2026-10:2026-10-22','a:private:L1','a:promo:2026-09','a:title:ldc:2026-27']);
  assert.equal(rows.find(r=>r.event_key==='combo:b1').payload.legs,4);assert.ok(rows.every(r=>!JSON.stringify(r.payload).match(/stake|bankroll|payout|mise/i)));
  const input={now,bets:[{id:'b1',user_id:'a',bet_type:'combined',odds:6,status:'won',settled_at:fresh}]};assert.deepEqual(F.planActivities(input),F.planActivities(structuredClone(input)));
});
test('les suggestions : même échelon, même division, même club de cœur ; profils privés, soi-même et déjà suivis exclus',()=>{
  const me={user_id:'me',echelon:11,heart_club_id:'160'},p=(id,echelon,club,pub=true)=>({user_id:id,nickname:id,echelon,heart_club_id:club,is_public:pub});
  const list=[p('same',11,null),p('div',10,null),p('club',3,'160'),p('both',11,'160'),p('far',3,null),p('private',11,'160',false),p('me',11,'160'),p('followed',11,'160')];
  assert.deepEqual(F.suggestPlayers(list,me,new Set(['followed'])).map(x=>x.user_id),['both','club','same','div']);assert.deepEqual(F.suggestPlayers(list,me,new Set(['followed']),2).map(x=>x.user_id),['both','club']);assert.deepEqual(F.suggestPlayers([],me),[]);assert.deepEqual(F.suggestPlayers(list,{user_id:'x',echelon:null,heart_club_id:null}),[]);
});
