// Page boutique (BET-62) : solde, usages des jetons (bouclier, recharge, duels), vitrine du jour, catalogue, inventaire. Chargée à la demande par app.js.
// Les achats, reventes, duels et recharges sont validés par le serveur (RPC) : cette page ne fait que demander et afficher.
import { CATEGORIES, DISPLAYABLE, PACKS, RARITIES, REFILL, SHIELD_PRICE, DUEL, canRefill, dailyShowcase, priceFor, purchaseBlock, resalePrice, validDuelStake } from './shop.js';
import { AVATAR_CATEGORIES, applyItem, isWorn, removeItem, ownedIds, sanitizeAvatar, stripUnowned } from './avatar-config.js';
import { backgroundSwatch, kitSwatch } from './avatar-scenes.js';

export function initShopPage({ api, html, toast, getState, parisToday, openJoin, avatar, openStudio }) {
  const root = document.querySelector('#shop-page');
  let data = null, category = 'all', main = null, aside = null, fit = null, fitFailed = false, fitStarting = null;
  const REASONS = { EXCLUSIF: 'Objet exclusif : il ne s’achète pas', POSSEDE: 'Déjà possédé', DIVISION: 'Réservé à une division supérieure', SOLDE: 'Solde de jetons insuffisant' };
  const coin = '<i class="coin" aria-hidden="true"></i>', fmt = value => Number(value).toLocaleString('fr-FR');

  async function load() {
    if (!getState().authenticated) { stop(); main = null; root.innerHTML = '<p class="empty">Connectez-vous pour accéder à la boutique et utiliser vos jetons.</p><button class="button secondary" data-join>Se connecter</button>'; return; }
    if (!main || !main.isConnected) { root.innerHTML = '<div class="shop-layout"><aside class="fitting" id="shop-fitting" hidden aria-label="Cabine d’essayage"></aside><div class="shop-main" id="shop-main"></div></div>'; main = root.querySelector('#shop-main'); aside = root.querySelector('#shop-fitting'); fit = null; fitFailed = false; }
    main.innerHTML = '<p class="empty">Chargement de la boutique…</p>';
    try { data = await api.load(); render(); startFitting(); } catch (error) { main.innerHTML = `<p class="empty">${html(error.message)}</p><button class="button secondary" data-reload>Réessayer</button>`; }
  }
  const owned = () => data.inventory.map(row => row.item_id);
  const equippedIds = () => new Set(data.equipped.map(row => row.item_id));
  const rarityClass = item => `rarity-${item.rarity}`;
  const tryable = item => !fitFailed && (AVATAR_CATEGORIES.includes(item.category) || item.category === 'pack');
  const thumb = item => item.category === 'kit' ? `<img class="shop-thumb" src="${kitSwatch(item.id, 72)}" alt="" width="72" height="72" loading="lazy">` : item.category === 'background' ? `<img class="shop-thumb" src="${backgroundSwatch(item.id, 96)}" alt="" width="96" height="96" loading="lazy">` : item.category === 'pack' ? `<img class="shop-thumb" src="${backgroundSwatch(`bg-${item.id.replace('pack-', '')}-in`, 96)}" alt="" width="96" height="96" loading="lazy">` : '';
  const savedLook = () => sanitizeAvatar(fit?.saved ?? avatar?.get?.());
  const card = (item, extra = '') => {
    const state = getState(), weeklyId = data.weekly, price = item.category === 'pack' ? item.price : priceFor(item, weeklyId), block = purchaseBlock({ ...item, minDivision: item.min_division }, { balance: data.balance, owned: owned(), division: state.division, weeklyId });
    const sale = item.id === weeklyId && item.category !== 'pack';
    return `<article class="shop-card ${rarityClass(item)}" data-item="${html(item.id)}"><small class="rarity-tag">${RARITIES[item.rarity].label}${sale ? ' · -30 % cette semaine' : ''}</small><strong>${html(item.name)}</strong>${thumb(item)}<span class="shop-price">${item.exclusive ? 'Exclusif' : `${coin}${sale ? `<s>${fmt(item.price)}</s> ` : ''}${fmt(price)}`}</span>${extra}<div class="shop-actions"><button class="button secondary" data-try="${html(item.id)}" ${tryable(item) ? '' : 'disabled'} title="${tryable(item) ? 'Voir sur mon joueur en 3D' : 'Cet objet ne s’affiche pas sur le joueur'}">Essayer</button><button class="button primary" data-buy="${html(item.id)}" ${block ? 'disabled' : ''} title="${block ? REASONS[block] : 'Acheter'}">${block === 'POSSEDE' ? 'Possédé' : 'Acheter'}</button></div></article>`;
  };
  function inventoryCard(row) {
    const item = data.items.find(entry => entry.id === row.item_id);
    if (!item) return '';
    const equipped = equippedIds().has(item.id), displayable = DISPLAYABLE.includes(item.category), onAvatar = AVATAR_CATEGORIES.includes(item.category), worn = onAvatar && isWorn(savedLook(), item.id);
    return `<article class="shop-card ${rarityClass(item)}"><small class="rarity-tag">${CATEGORIES[item.category] ?? 'Pack'}</small><strong>${html(item.name)}</strong>${thumb(item)}<div class="shop-actions">${onAvatar ? `<button class="button secondary" data-${worn ? 'unwear' : 'wear'}="${html(item.id)}">${worn ? 'Retirer de l’avatar' : 'Porter'}</button>` : displayable ? `<button class="button secondary" data-${equipped ? 'unequip' : 'equip'}="${html(equipped ? item.category : item.id)}">${equipped ? 'Retirer' : 'Équiper'}</button>` : ''}<button class="button secondary" data-sell="${html(item.id)}" title="Revente à 30 % du prix payé">Revendre · ${coin}${fmt(resalePrice(row.price_paid))}</button></div></article>`;
  }
  function usages() {
    const state = getState(), joined = data.leagues.filter(league => data.myLeagues.includes(league.id)), shielded = new Set(data.shields.map(row => row.league));
    const options = [['general', 'Ligue générale'], ...joined.map(league => [league.id, league.name])].filter(([id]) => !shielded.has(id));
    const friends = data.following, duels = data.duels;
    return `<div class="shop-uses"><section class="settings-card"><h3>Bouclier de série</h3><p class="muted">${fmt(SHIELD_PRICE)} jetons, une fois par saison et par ligue : votre prochaine défaite ne casse pas la série.</p>${options.length ? `<div class="settings-row"><select id="shield-league" aria-label="Ligue du bouclier">${options.map(([id, name]) => `<option value="${html(id)}">${html(name)}</option>`).join('')}</select><button class="button secondary" data-shield ${data.balance < SHIELD_PRICE ? 'disabled' : ''}>Acheter</button></div>` : '<p class="muted">Vous avez déjà un bouclier pour toutes vos ligues cette saison.</p>'}</section>
<section class="settings-card"><h3>Recharge de bankroll</h3><p class="muted">${fmt(REFILL.amount)} € fictifs contre ${REFILL.price} jetons, seulement si votre bankroll est sous ${REFILL.below} €. Bankroll actuelle : ${fmt(Math.round(state.bankroll * 100) / 100)} €.</p><button class="button secondary" data-refill ${canRefill(state.bankroll, data.balance) ? '' : 'disabled'}>Recharger</button></section>
<section class="settings-card"><h3>Duels sur le défi du jour</h3><p class="muted">Défiez un joueur que vous suivez : chacun engage ${DUEL.min} à ${fmt(DUEL.max)} jetons, le meilleur total de points du jour remporte le tout, égalité remboursée.</p>${friends.length ? `<div class="settings-row"><select id="duel-opponent" aria-label="Adversaire">${friends.map(friend => `<option value="${html(friend.user_id)}">${html(friend.nickname)}</option>`).join('')}</select><input id="duel-stake" type="number" min="${DUEL.min}" max="${DUEL.max}" step="10" value="100" aria-label="Mise en jetons"><button class="button secondary" data-duel-create>Défier</button></div>` : '<p class="muted">Suivez un joueur depuis la communauté pour pouvoir le défier.</p>'}${duels.length ? `<ul class="duel-list">${duels.map(duel => { const me = getState().userId, other = duel.creator_id === me ? duel.opponent_id : duel.creator_id, name = data.names[other] ?? 'Un joueur', label = { pending: 'En attente', accepted: 'Accepté', settled: duel.winner_id === me ? 'Gagné' : 'Perdu', refunded: 'Remboursé', declined: 'Refusé', cancelled: 'Annulé', expired: 'Expiré' }[duel.status]; return `<li><span>${html(name)} · ${fmt(duel.stake)} jetons · ${html(label)}</span>${duel.status === 'pending' ? (duel.opponent_id === me ? `<button class="button secondary" data-duel-accept="${html(duel.id)}">Accepter</button><button class="text-button" data-duel-close="${html(duel.id)}">Refuser</button>` : `<button class="text-button" data-duel-close="${html(duel.id)}">Annuler</button>`) : ''}</li>`; }).join('')}</ul>` : ''}</section></div>`;
  }
  function render() {
    const cats = ['all', ...Object.keys(CATEGORIES).filter(key => key !== 'title'), 'pack'], today = parisToday(), showcaseIds = dailyShowcase(data.items, today), weekly = data.items.find(item => item.id === data.weekly);
    const visible = data.items.filter(item => category === 'all' || item.category === category);
    main.innerHTML = `<header class="shop-head"><div><p class="eyebrow">BOUTIQUE</p><h2>${coin}${fmt(data.balance)} jetons</h2><small>Les jetons n’ont aucune valeur : ils ne s’achètent pas, ne s’échangent pas et ne se convertissent pas. Noms génériques, sans marque.</small></div></header>${usages()}
<h3>Vitrine du jour <small>renouvelée chaque jour à minuit</small></h3><div class="shop-grid">${weekly ? card(weekly, '<span class="weekly-flag">Objet de la semaine</span>') : ''}${showcaseIds.map(id => data.items.find(item => item.id === id)).filter(Boolean).map(item => card(item)).join('')}</div>
<h3>Catalogue</h3><div class="community-tabs shop-tabs" role="tablist">${cats.map(key => `<button role="tab" data-cat="${key}" aria-selected="${category === key}">${key === 'all' ? 'Tout' : key === 'pack' ? 'Packs stade' : CATEGORIES[key]}</button>`).join('')}</div><div class="shop-grid">${visible.map(item => card(item)).join('')}</div>
<h3>Mon inventaire <small>${data.inventory.length} objet${data.inventory.length > 1 ? 's' : ''}</small></h3><div class="shop-grid">${data.inventory.map(inventoryCard).join('') || '<p class="empty">Votre inventaire est vide : gagnez des jetons en fin de saison et dans les défis hebdomadaires.</p>'}</div>`;
  }
  async function run(action, success) { try { const result = await action(); toast(typeof success === 'function' ? success(result) : success); data = await api.load(); render(); updateBar(); getState().refresh?.(); } catch (error) { toast(error.message); } }

  // Cabine d'essayage 3D : l'avatar enregistré du joueur, sur lequel « Essayer » pose n'importe quel objet avant achat. Chargée après la boutique, une seule scène.
  const ownedNow = () => ownedIds(owned(), fit?.unlocks ?? []);
  async function startFitting() {
    if (fit || fitFailed) { updateBar(); return; }
    fitStarting ??= (async () => {
      aside.hidden = false; aside.innerHTML = '<div class="studio-canvas" data-fit-host><p class="studio-loading">Cabine d’essayage…</p></div><div class="fitting-bar" data-fit-bar></div>';
      try {
        const [module, context] = await Promise.all([import('./avatar.js'), avatar.context().catch(() => ({ inventory: [], unlocks: [] }))]);
        if (!module.webglSupported()) throw new Error('WEBGL');
        const host = aside.querySelector('[data-fit-host]'); host.innerHTML = ''; const look = savedLook();
        fit = { stage: await module.createStage(host, { look, view: 'full', label: 'Cabine d’essayage 3D' }), saved: look, look, unlocks: context.unlocks, trying: null };
      } catch (error) { fitFailed = true; aside.innerHTML = '<p class="muted">La cabine d’essayage 3D n’est pas disponible sur cet appareil. Vous pouvez tout de même acheter et porter vos objets.</p>'; }
    })();
    await fitStarting; fitStarting = null; updateBar();
  }
  function updateBar() {
    const bar = aside?.querySelector('[data-fit-bar]'); if (!bar || !fit) return;
    const trying = fit.trying;
    if (!trying) { bar.innerHTML = '<strong>Cabine d’essayage</strong><span class="muted">Appuyez sur « Essayer » : l’objet apparaît sur votre joueur.</span><button class="button secondary" data-fit-studio>Ouvrir le studio</button>'; return; }
    const missing = trying.ids.filter(id => !ownedNow().has(id));
    bar.innerHTML = `<strong>${html(trying.name)}</strong>${missing.length ? `<button class="button primary" data-buy="${html(trying.id)}">Acheter · ${coin}${fmt(trying.price)}</button>` : `<button class="button primary" data-wear="${html(trying.ids[0])}">Porter</button>`}<button class="button secondary" data-fit-reset>Retirer l’essai</button>`;
  }
  async function tryItem(id) {
    const item = data.items.find(entry => entry.id === id); if (!item) return;
    await startFitting(); if (!fit) { toast('Cabine d’essayage indisponible sur cet appareil'); return; }
    const ids = item.category === 'pack' ? (PACKS.find(pack => pack.id === id)?.components ?? item.pack_of ?? []) : [id];
    fit.look = ids.reduce((look, other) => applyItem(look, other), fit.look); fit.stage.setLook(fit.look);
    fit.trying = { id, ids, name: item.name, price: item.category === 'pack' ? item.price : priceFor(item, data.weekly) };
    if (item.category === 'celebration') fit.stage.celebrate(id);
    updateBar(); if (matchMedia('(max-width: 1100px)').matches) aside.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  // Porter ou retirer un objet possédé : la configuration, puis les images (buste, en pied) sont enregistrées.
  async function wearItem(id, remove) {
    try {
      await startFitting();
      const config = remove ? removeItem(savedLook(), id) : applyItem(savedLook(), id), clean = stripUnowned(config, ownedNow()).config;
      let blobs = null;
      if (fit) { fit.stage.setLook(clean); try { blobs = { bust: await fit.stage.snapshot('bust'), full: await fit.stage.snapshot('full') }; } catch { /* image non générée : la configuration reste enregistrée */ } fit.stage.setLook(fit.look); }
      const saved = sanitizeAvatar(await avatar.save(clean, blobs)); avatar.saved?.(saved);
      if (fit) { fit.saved = saved; fit.look = saved; fit.trying = null; fit.stage.setLook(saved); updateBar(); }
      render(); toast(remove ? 'Objet retiré de votre avatar' : 'Objet porté : votre avatar est à jour');
    } catch (error) { toast(error.message); }
  }
  function stop() { fit?.stage.dispose(); fit = null; fitStarting = null; if (aside) { aside.innerHTML = ''; aside.hidden = true; } }
  root.addEventListener('click', event => {
    const buy = event.target.closest('[data-buy]'), sell = event.target.closest('[data-sell]');
    const tryButton = event.target.closest('[data-try]'), wearButton = event.target.closest('[data-wear]'), unwearButton = event.target.closest('[data-unwear]');
    if (tryButton) { tryItem(tryButton.dataset.try); return; }
    if (wearButton) { wearItem(wearButton.dataset.wear, false); return; }
    if (unwearButton) { wearItem(unwearButton.dataset.unwear, true); return; }
    if (event.target.closest('[data-fit-reset]')) { if (fit) { fit.look = fit.saved; fit.trying = null; fit.stage.setLook(fit.saved); updateBar(); } return; }
    if (event.target.closest('[data-fit-studio]')) { openStudio?.(); return; }
    if (event.target.closest('[data-join]')) { openJoin('login'); return; }
    if (event.target.closest('[data-reload]')) { load(); return; }
    const cat = event.target.closest('[data-cat]');
    if (cat) { category = cat.dataset.cat; render(); return; }
    if (buy) { const item = data.items.find(entry => entry.id === buy.dataset.buy); if (confirm(`Acheter « ${item.name} » ?`)) run(() => api.buy(item.id), result => `Acheté : ${item.name} (-${fmt(result.price)} jetons)`); return; }
    if (sell) { const row = data.inventory.find(entry => entry.item_id === sell.dataset.sell), item = data.items.find(entry => entry.id === sell.dataset.sell); if (confirm(`Revendre « ${item.name} » pour ${fmt(resalePrice(row.price_paid))} jetons ?`)) run(() => api.sell(item.id), result => `Revendu pour ${fmt(result.refund)} jetons`); return; }
    const equip = event.target.closest('[data-equip]'), unequip = event.target.closest('[data-unequip]');
    if (equip) { run(() => api.equip(equip.dataset.equip), 'Objet équipé'); return; }
    if (unequip) { run(() => api.unequip(unequip.dataset.unequip), 'Objet retiré'); return; }
    if (event.target.closest('[data-shield]')) { const league = root.querySelector('#shield-league').value; if (confirm(`Acheter le bouclier de série pour ${SHIELD_PRICE} jetons ?`)) run(() => api.shield(league), 'Bouclier de série activé'); return; }
    if (event.target.closest('[data-refill]')) { if (confirm(`Recharger ${REFILL.amount} € fictifs pour ${REFILL.price} jetons ?`)) run(() => api.refill(), 'Bankroll rechargée'); return; }
    if (event.target.closest('[data-duel-create]')) { const stake = Number(root.querySelector('#duel-stake').value), opponent = root.querySelector('#duel-opponent').value; if (!validDuelStake(stake)) { toast(`La mise va de ${DUEL.min} à ${fmt(DUEL.max)} jetons`); return; } run(() => api.duelCreate(opponent, stake), 'Défi envoyé'); return; }
    const accept = event.target.closest('[data-duel-accept]'), close = event.target.closest('[data-duel-close]');
    if (accept) run(() => api.duelAccept(accept.dataset.duelAccept), 'Duel accepté'); else if (close) run(() => api.duelClose(close.dataset.duelClose), 'Duel clos : mise remboursée');
  });
  return { load, stop };
}
