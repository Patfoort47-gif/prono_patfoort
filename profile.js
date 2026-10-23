// Page profil (BET-50) : en-tête, onglets, carte joueur partageable, radar, saisons, trophées, compte et confidentialité. Chargée à la demande par app.js.
// Les chiffres de la carte viennent de formules pures de model.js (cardAttributes, cardOverall) ; les données de la vue serveur public_player_card.
import { avatarMarkup } from './avatar-view.js';
import { sanitizeAvatar } from './avatar-config.js';
import { profileHistory } from './profile-history.js';
import { CATALOG } from './shop.js';
const NS = 'http://www.w3.org/2000/svg';
const TABS = [['overview', 'Aperçu'], ['seasons', 'Saisons'], ['badges', 'Trophées'], ['bets', 'Mes paris'], ['avatar', 'Avatar', true], ['account', 'Compte et confidentialité', true]];
const DIVISION_COLORS = ['#8a6d4b', '#b87333', '#9aa5b1', '#d4a017', '#2fa4a4', '#7a4dd8', '#C8F03C'];

export function initProfilePage(deps) {
  const { html, money, divisionBadge, levelInfo, avatarConfig, safeLogo, BADGES, echelonName, chevrons, divisionIndex, model, accountApi, getState, toast, openAvatar, openJoin, navigate, onLoggedOut } = deps;
  const { cardAttributes, cardOverall, cardProvisional, averageAttributes, CARD_ATTRIBUTES } = model;
  const root = document.querySelector('#profile-page');
  let data = null, tab = 'overview', compare = null, target = null, token = 0, hero = null, studio = null, mountToken = 0;

  const dateLabel = value => value ? new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const color = echelon => echelon == null ? '#6b7280' : DIVISION_COLORS[divisionIndex(echelon)];
  const clubCrest = profile => profile.heart_club_id && /^\d{1,8}$/.test(profile.heart_club_id) ? safeLogo(`https://a.espncdn.com/i/teamlogos/soccer/500/${profile.heart_club_id}.png`) : null;
  const seasonLabel = season => { const [year, month] = season.split('-').map(Number); return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };

  // Radar des 6 attributs : joueur affiché, moyenne du groupe, et vos propres attributs en mode comparaison.
  function radar(series) {
    const size = 260, center = size / 2, radius = 96, count = CARD_ATTRIBUTES.length, point = (index, value) => { const angle = -Math.PI / 2 + index * 2 * Math.PI / count, distance = radius * value / 99; return [center + Math.cos(angle) * distance, center + Math.sin(angle) * distance]; };
    const rings = [33, 66, 99].map(level => `<polygon points="${CARD_ATTRIBUTES.map((_, index) => point(index, level).join(',')).join(' ')}" fill="none" stroke="var(--line-strong)" stroke-width="1"/>`).join('');
    const axes = CARD_ATTRIBUTES.map((name, index) => { const [x, y] = point(index, 99), [lx, ly] = point(index, 118); return `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" stroke="var(--line)"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="var(--muted)">${name}</text>`; }).join('');
    const shapes = series.map(item => `<polygon points="${CARD_ATTRIBUTES.map((name, index) => point(index, item.values[name]).join(',')).join(' ')}" fill="${item.fill}" fill-opacity=".22" stroke="${item.stroke}" stroke-width="2.5" ${item.dash ? 'stroke-dasharray="5 4"' : ''}/>`).join('');
    return `<svg class="radar" viewBox="0 0 ${size} ${size}" role="img" aria-label="Radar des attributs : ${series.map(item => `${item.label} ${CARD_ATTRIBUTES.map(name => `${name} ${item.values[name]}`).join(', ')}`).join(' ; ')}">${rings}${axes}${shapes}</svg><div class="radar-legend">${series.map(item => `<span><i style="background:${item.stroke}"></i>${html(item.label)}</span>`).join('')}</div>`;
  }
  function attributesOf(raw) { return cardAttributes(raw); }
  function cardHtml(info) {
    const attributes = attributesOf(info.raw), overall = cardOverall(attributes), provisional = cardProvisional(info.raw), level = levelInfo(info.xp);
    return `<div class="player-card${info.equipped?.frame ? ` frame-${html(info.equipped.frame.asset)}` : ''}" style="--card:${color(info.echelon)}" id="player-card"><div class="card-top"><b class="card-overall">${overall}</b><span>${info.echelon == null ? 'Placement' : html(echelonName(info.echelon))}<em>${info.echelon == null ? '' : chevrons(info.echelon)}</em></span></div><strong class="card-name">${html(info.profile.nickname)}</strong><small>Niv. ${level.level} · ${level.title}${provisional ? ' · provisoire' : ''}</small><div class="card-attrs">${CARD_ATTRIBUTES.map(name => `<span><b>${attributes[name]}</b>${name}</span>`).join('')}</div></div>`;
  }
  // Partage de la carte en image : canvas vers PNG, partage natif sur téléphone, sinon téléchargement.
  async function shareCard(info) {
    const attributes = attributesOf(info.raw), overall = cardOverall(attributes), level = levelInfo(info.xp), canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 800; const ctx = canvas.getContext('2d'), accent = color(info.echelon);
    const gradient = ctx.createLinearGradient(0, 0, 600, 800); gradient.addColorStop(0, accent); gradient.addColorStop(1, '#0A0C0B'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = 'rgba(10,12,11,.78)'; ctx.beginPath(); ctx.moveTo(300, 40); ctx.lineTo(560, 110); ctx.lineTo(560, 520); ctx.quadraticCurveTo(560, 700, 300, 770); ctx.quadraticCurveTo(40, 700, 40, 520); ctx.lineTo(40, 110); ctx.closePath(); ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#F4F7F2'; ctx.textAlign = 'center'; ctx.font = '800 120px "Barlow Condensed", Impact, sans-serif'; ctx.fillText(String(overall), 300, 220);
    ctx.font = '700 28px Inter, sans-serif'; ctx.fillStyle = accent; ctx.fillText(info.echelon == null ? 'Saison de placement' : `${echelonName(info.echelon)} ${chevrons(info.echelon)}`, 300, 270);
    ctx.fillStyle = '#F4F7F2'; ctx.font = '800 54px "Barlow Condensed", Impact, sans-serif'; ctx.fillText(info.profile.nickname.toUpperCase(), 300, 345, 440);
    ctx.font = '600 22px Inter, sans-serif'; ctx.fillStyle = '#C9D3C6'; ctx.fillText(`Niveau ${level.level} · ${level.title}${cardProvisional(info.raw) ? ' · provisoire' : ''}`, 300, 385);
    CARD_ATTRIBUTES.forEach((name, index) => { const x = 130 + (index % 3) * 170, y = 470 + Math.floor(index / 3) * 110; ctx.fillStyle = '#F4F7F2'; ctx.font = '800 56px "Barlow Condensed", Impact, sans-serif'; ctx.fillText(String(attributes[name]), x, y); ctx.fillStyle = '#9FB09A'; ctx.font = '700 20px Inter, sans-serif'; ctx.fillText(name, x, y + 30); });
    ctx.fillStyle = '#9FB09A'; ctx.font = '500 16px Inter, sans-serif'; ctx.fillText('BetMaster · paris virtuels · 18+', 300, 740);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { toast('Impossible de générer l’image de la carte'); return; }
    const file = new File([blob], `carte-${info.profile.nickname}.png`, { type: 'image/png' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Ma carte BetMaster' }); return; } } catch (error) { if (error?.name === 'AbortError') return; }
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 2000); toast('Carte téléchargée');
  }

  // Comparaison : bilan saison par saison des deux joueurs côte à côte.
  function seasonsCompare(info) {
    const months = [...new Set([...info.seasons, ...info.own.seasons].map(row => row.season))].sort().reverse(), cell = row => row ? `${html(echelonName(row.to_echelon))} · ${Number(row.points).toFixed(1)} pts` : '-';
    return `<h3>Bilan saison par saison</h3><div class="compare-table"><div class="compare-row compare-head"><span>Saison</span><b>${html(info.profile.nickname)}</b><b>Vous</b></div>${months.map(month => `<div class="compare-row"><span>${seasonLabel(month)}</span><b>${cell(info.seasons.find(row => row.season === month))}</b><b>${cell(info.own.seasons.find(row => row.season === month))}</b></div>`).join('') || '<p class="empty">Aucune saison terminée.</p>'}</div>`;
  }
  function overview(info) {
    const attributes = attributesOf(info.raw), group = info.groupRaws.length ? averageAttributes(info.groupRaws.map(attributesOf)) : null, mine = compare ? attributesOf(compare.raw) : null, standing = info.standing, state = getState();
    const series = [{ label: info.profile.nickname, values: attributes, stroke: 'var(--accent-text)', fill: 'var(--accent)' }];
    if (group) series.push({ label: 'Moyenne du groupe', values: group, stroke: '#7a8a96', fill: '#7a8a96', dash: true });
    if (mine && !info.self) series.push({ label: 'Vous', values: mine, stroke: '#e0663c', fill: '#e0663c' });
    const key = (label, value) => `<div class="key-number"><small>${label}</small><strong>${value}</strong></div>`;
    const personal = info.self ? profileHistory(state.history) : null;
    const form = personal ? personal.form : standing?.form ?? '';
    const historySummary = personal ? `<section class="settings-card"><h3>Tout votre historique</h3><p class="muted">Paris certifiés et ${personal.legacy} ancien${personal.legacy > 1 ? 's' : ''} pari${personal.legacy > 1 ? 's' : ''}. Ce bilan personnel reste privé ; la carte publique et les ligues utilisent les résultats certifiés.</p><div class="key-numbers">${key('Paris réglés', personal.settled)}${key('Paris gagnés', personal.wins)}${key('Réussite', personal.winrate == null ? '-' : personal.winrate.toFixed(1) + ' %')}${key('ROI historique', personal.roi == null ? '-' : personal.roi.toFixed(1) + ' %')}</div><p class="muted">${personal.pending} en attente · ${personal.void} remboursé${personal.void > 1 ? 's' : ''} (exclus du ROI et du taux de réussite)</p></section>` : '';
    const stats = info.profile.period_stats?.season ?? { bets: 0, wins: 0, roi: 0 };
    const recent = info.badges.slice(0, 4).map(item => BADGES.find(badge => badge.id === item.badge)).filter(Boolean);
    return `<div class="overview-grid has-hero"><div class="avatar-hero" data-hero data-hero-id="${html(info.profile.user_id)}"><span class="hero-fallback">${avatarMarkup(info.profile, { cls: 'avatar-3d', kind: 'full', userId: info.profile.user_id, label: `Avatar de ${info.profile.nickname}` })}</span><div class="hero-actions"><button class="button secondary" data-hero-celebrate>Célébrer</button>${info.self ? '<button class="button secondary" data-tab="avatar">Personnaliser</button>' : ''}</div></div><div>${cardHtml(info)}<div class="card-actions">${info.self ? '<button class="button secondary" data-share-card>Partager ma carte</button>' : (getState().profile ? '<button class="button secondary" data-compare>' + (compare ? 'Masquer la comparaison' : 'Comparer avec moi') + '</button>' : '')}</div></div><div class="overview-side">${historySummary}<div class="key-numbers">${key('Rang du groupe', standing ? `${standing.rank}e` : '-')}${key('Points de ligue', standing ? Number(standing.points).toFixed(1) : '-')}${key('Paris réglés (saison)', Number(stats.bets) || 0)}${key('ROI (saison)', `${Number(stats.roi) >= 0 ? '+' : ''}${Number(stats.roi || 0).toFixed(1)} %`)}</div><div class="form-line"><small>Forme sur les ${info.self ? 10 : 5} derniers pronos</small><span>${form ? form.split('').map(letter => `<i class="fd ${letter === 'V' ? 'V' : letter === 'N' ? 'N' : 'D'}">${letter}</i>`).join('') : '<em>Pas encore de pronos réglés</em>'}</span></div>${info.self && deps.race?.() ? `<p class="league-race">${deps.race()}</p>` : ''}<div class="radar-box">${radar(series)}</div></div></div>${compare && info.own?.seasons ? seasonsCompare(info) : ''}<h3>Trophées récents</h3><div class="badge-grid">${recent.length ? recent.map(badge => `<div class="badge earned"><b>${html(badge.name)}</b><small>${html(badge.hint)}</small></div>`).join('') : '<p class="empty">Aucun trophée pour le moment.</p>'}</div>`;
  }
  function seasons(info) {
    const rows = info.seasons.slice().reverse();
    return rows.length ? `<ol class="season-line">${rows.map(row => { const move = row.to_echelon > (row.from_echelon ?? -1) && row.outcome === 'PROMU' ? 'up' : row.outcome === 'RELEGUE' ? 'down' : 'same'; return `<li class="${move}"><small>${seasonLabel(row.season)}</small><span>${divisionBadge(row.from_echelon)}<i aria-hidden="true">→</i>${divisionBadge(row.to_echelon)}</span><em>${row.group_rank ? `${row.group_rank}e sur ${row.group_size} · ` : ''}${Number(row.points).toFixed(1)} pts · ${{ PROMU: 'Promu', RELEGUE: 'Relégué', MAINTENU: 'Maintenu', PLACE: 'Placé', INACTIF: 'Inactif' }[row.outcome] ?? ''}</em></li>`; }).join('')}</ol>` : '<p class="empty">Aucune saison terminée pour le moment : la première clôture a lieu à la fin du mois.</p>';
  }
  function badges(info) {
    const earned = new Map(info.badges.map(item => [item.badge, item.earned_at]));
    return `<div class="badge-grid">${BADGES.map(badge => `<div class="badge${earned.has(badge.id) ? ' earned' : ''}"><b>${html(badge.name)}</b><small>${html(badge.hint)}</small><em>${earned.has(badge.id) ? `Obtenu le ${dateLabel(earned.get(badge.id))}` : `+${badge.xp} XP`}</em></div>`).join('')}</div><h3>Vitrine</h3>${showcase(info)}`;
  }
  // Vitrine : les trophées que le joueur a posés devant son avatar.
  function showcase(info) {
    const ids = sanitizeAvatar(info.profile.avatar_config).showcase, items = ids.map(id => CATALOG.find(entry => entry.id === id)).filter(Boolean);
    return items.length ? `<div class="badge-grid">${items.map(item => `<div class="badge earned"><b>${html(item.name)}</b><small>Posé devant son avatar</small></div>`).join('')}</div>` : `<p class="empty">${info.self ? 'Aucun trophée en vitrine : posez-en depuis le studio d’avatar (onglet Vitrine).' : 'Aucun trophée en vitrine.'}</p>`;
  }
  function bets(info) {
    if (info.self) return `<p class="muted">Votre historique complet est dans l’onglet « Mes paris ». Les autres joueurs ne voient le détail que si vous l’autorisez dans « Compte et confidentialité ».</p><button class="button secondary" data-open-bets>Ouvrir mes paris</button>`;
    if (!info.profile.show_bets || !info.bets) return '<p class="empty">Ce joueur a choisi de masquer le détail de ses paris.</p>';
    return info.bets.length ? `<div class="public-bets">${info.bets.map(bet => `<div class="public-bet ${bet.status}"><small>${dateLabel(bet.placed_at)} · ${bet.bet_type === 'multiple' ? 'Système' : bet.selections.length > 1 ? `Combiné ${bet.selections.length} sélections` : 'Simple'} · cote ${Number(bet.odds).toFixed(2)}</small>${bet.selections.map(item => `<span>${html(item.match)} · <b>${html(item.label)}</b></span>`).join('')}<em class="status ${bet.status}">${{ won: 'Gagné', lost: 'Perdu', void: 'Remboursé', pending: 'En attente' }[bet.status]}</em></div>`).join('')}</div>` : '<p class="empty">Aucun pari à afficher.</p>';
  }
  function account(info) {
    const profile = info.profile, state = getState();
    return `<div class="account-settings"><form data-form="nickname" class="settings-card"><h3>Pseudo</h3><p class="muted">Modifiable une fois par mois. Votre pseudo est unique.</p><div class="settings-row"><input name="nickname" value="${html(profile.nickname)}" minlength="3" maxlength="24" pattern="[A-Za-zÀ-ÿ0-9_. -]{3,24}" required aria-label="Pseudo"><button class="button secondary">Changer</button></div></form>
<form data-form="email" class="settings-card"><h3>Adresse email</h3><p class="muted">Un lien de confirmation est envoyé à la nouvelle adresse.</p><div class="settings-row"><input name="email" type="email" placeholder="nouvelle@adresse.fr" required autocomplete="email" aria-label="Nouvelle adresse email"><button class="button secondary">Modifier</button></div></form>
<form data-form="password" class="settings-card"><h3>Mot de passe</h3><div class="settings-row"><input name="password" type="password" minlength="8" placeholder="Nouveau mot de passe (8 caractères)" required autocomplete="new-password" aria-label="Nouveau mot de passe"><button class="button secondary">Modifier</button></div></form>
<div class="settings-card"><h3>Confidentialité</h3><label class="switch-line"><input type="checkbox" data-setting="is_public" ${profile.is_public ? 'checked' : ''}><span><b>Profil public</b><small>Les autres joueurs voient votre profil, votre carte et vos trophées. Votre pseudo et vos résultats restent visibles dans les classements.</small></span></label><label class="switch-line"><input type="checkbox" data-setting="show_bets" ${profile.show_bets ? 'checked' : ''}><span><b>Détail de mes paris visible</b><small>Sélections, cotes et résultats, jamais les mises ni la bankroll.</small></span></label></div>
<div class="settings-card"><h3>Mes données</h3><p class="muted">Téléchargez toutes vos données (profil, paris, ligues, XP, jetons) au format JSON.</p><button class="button secondary" data-export>Exporter mes données</button></div>
<form data-form="delete" class="settings-card danger"><h3>Supprimer mon compte</h3><p class="muted">Définitif : votre profil, vos paris, vos classements, votre XP et vos jetons sont effacés. Saisissez votre pseudo <b>${html(profile.nickname)}</b> pour confirmer.</p><div class="settings-row"><input name="confirm" placeholder="Votre pseudo" required aria-label="Confirmation par le pseudo" autocomplete="off"><button class="button danger">Supprimer définitivement</button></div></form></div>`;
  }
  function avatarTab() { return '<div class="avatar-studio-slot" data-studio></div>'; }

  // Avatar 3D : scène de l'en-tête de l'aperçu (Three.js chargé à la demande) et studio de l'onglet Avatar ; une seule scène à la fois, libérée au changement d'onglet.
  function cleanup() { mountToken++; hero?.dispose(); hero = null; studio?.destroy(); studio = null; }
  async function mountHero(info) {
    const host = root.querySelector('[data-hero]'), mine = mountToken; if (!host) return;
    try {
      const { webglSupported, createStage } = await import('./avatar.js');
      if (!webglSupported() || mine !== mountToken) return;
      const stage = await createStage(host, { look: info.profile.avatar_config, view: 'full', label: `Avatar 3D de ${info.profile.nickname}` });
      if (mine !== mountToken || !host.isConnected) { stage.dispose(); return; }
      hero = stage; host.querySelector('.hero-fallback')?.remove(); host.classList.add('live');
    } catch (error) { console.warn('Avatar 3D indisponible', error?.message); }
  }
  async function mountStudioTab(info) {
    const host = root.querySelector('[data-studio]'), mine = mountToken; if (!host) return;
    const { mountStudio } = await import('./avatar-studio.js');
    if (mine !== mountToken) return;
    const state = getState(), initial = sanitizeAvatar(info.profile.avatar_config ?? state.profile?.avatar2 ?? state.profile);
    const handle = await mountStudio(host, {
      html, toast, initial, authenticated: Boolean(info.self), userId: info.profile.user_id, loadContext: () => accountApi.avatarContext(), openShop: () => navigate('shop'), openJoin,
      save: async (config, blobs) => { const saved = await accountApi.saveAvatar(config, blobs); data.profile.avatar_config = saved; const slot = root.querySelector('.profile-id')?.firstElementChild; if (slot) slot.outerHTML = avatarMarkup(data.profile, { cls: 'avatar-3d', userId: data.profile.user_id }); deps.onAvatarSaved?.(saved); return saved; }
    });
    if (mine !== mountToken) { handle.destroy(); return; }
    studio = handle;
  }

  function render() {
    cleanup();
    if (!data) { root.innerHTML = '<p class="empty">Chargement du profil…</p>'; return; }
    if (data.failed) { root.innerHTML = `<p class="empty">${html(data.failed)}</p><button class="button secondary" data-reload-profile>Réessayer</button>`; return; }
    if (data.missing) { root.innerHTML = '<p class="empty">Ce joueur n’existe pas.</p><button class="button secondary" data-back-home>Retour</button>'; return; }
    if (data.private) { root.innerHTML = `<div class="profile-private"><h2>${html(data.profile.nickname)}</h2><p class="empty">Ce profil est privé.</p><button class="button secondary" data-back-home>Retour à la communauté</button></div>`; return; }
    const info = data, level = levelInfo(info.xp), crest = clubCrest(info.profile), visibleTabs = TABS.filter(([, , own]) => !own || info.self);
    const body = { overview, seasons, badges, bets, avatar: avatarTab, account }[tab](info);
    root.innerHTML = `<header class="profile-header" style="--banner:${color(info.echelon)}"><div class="profile-banner"></div><div class="profile-id">${avatarMarkup(info.profile, { cls: 'avatar-3d', userId: info.profile.user_id })}<div class="profile-title"><h2>${html(info.profile.nickname)}</h2>${info.equipped?.title ? `<small class="profile-subtitle">${html(info.equipped.title.asset ?? info.equipped.title.name)}</small>` : ''}<div class="profile-badges">${divisionBadge(info.echelon)}<span class="level-chip">${level.level}</span><b>${level.title}</b>${crest ? `<img class="profile-crest" src="${crest}" alt="${html(info.profile.heart_club_name ?? 'Club de cœur')}" width="26" height="26">` : ''}</div><small>Membre depuis le ${dateLabel(info.profile.joined_at)}${info.followers != null ? ` · ${info.followers} abonné${info.followers > 1 ? 's' : ''}` : ''}</small></div><div class="profile-actions">${info.self ? '<button class="button secondary" data-share-card>Partager ma carte</button><button class="button secondary" data-tab="account">Modifier le profil</button>' : (deps.extraActions?.(info) ?? '')}</div></div></header><div class="profile-tabs" role="tablist">${visibleTabs.map(([id, label]) => `<button role="tab" id="ptab-${id}" aria-selected="${tab === id}" data-tab="${id}">${label}</button>`).join('')}</div><div class="profile-body" role="tabpanel">${body}</div>`;
    if (tab === 'overview') mountHero(info); else if (tab === 'avatar' && info.self) mountStudioTab(info);
  }

  async function show(next) {
    target = next; const mine = ++token; tab = next.tab ?? 'overview'; compare = null; data = null; render();
    try {
      const result = await accountApi.loadPlayer(next.self ? { self: true } : { nickname: next.nickname });
      if (mine !== token) return;
      data = result ?? { missing: true };
      if (data.profile && !data.private && !data.missing && !data.self && getState().profile) { try { const own = await accountApi.loadPlayer({ self: true }); compare = null; data.own = own; } catch { /* comparaison indisponible */ } }
      if (data.self === false && deps.followers) data.followers = await deps.followers(data.profile.user_id);
      if (data.self && deps.followers) data.followers = await deps.followers(data.profile.user_id);
    } catch (error) { if (mine === token) data = { failed: error?.code === 'SCHEMA' ? error.message : 'Le profil n’a pas pu être chargé. Vérifiez votre connexion puis réessayez.' }; console.warn('Profil indisponible', error?.message); }
    render();
  }

  root.addEventListener('click', async event => {
    if (event.target.closest('[data-reload-profile]')) { show(target); return; }
    const tabButton = event.target.closest('[data-tab]');
    if (tabButton) { tab = tabButton.dataset.tab; render(); root.querySelector(`#ptab-${tab}`)?.focus(); return; }
    if (event.target.closest('[data-share-card]')) { shareCard(data); return; }
    if (event.target.closest('[data-compare]')) { compare = compare ? null : (data.own?.raw ? { raw: data.own.raw } : null); if (!compare && !data.own) toast('Connectez-vous pour comparer'); render(); return; }
    if (event.target.closest('[data-open-avatar]')) { openAvatar(); return; }
    if (event.target.closest('[data-hero-celebrate]')) { if (hero) hero.celebrate(); else toast('Le rendu 3D n’est pas disponible sur cet appareil'); return; }
    if (event.target.closest('[data-open-bets]')) { navigate('bankroll'); return; }
    if (event.target.closest('[data-back-home]')) { navigate('community'); return; }
    if (event.target.closest('[data-export]')) {
      try { const blob = new Blob([JSON.stringify(await accountApi.exportData(), null, 2)], { type: 'application/json' }), link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `betmaster-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 2000); toast('Export téléchargé'); } catch (error) { toast(error.message); }
      return;
    }
    deps.onClick?.(event, { data, show: () => show(target) });
  });
  root.addEventListener('change', async event => {
    const setting = event.target.closest('[data-setting]');
    if (!setting) return;
    try { await accountApi.updateSettings({ [setting.dataset.setting]: setting.checked }); data.profile[setting.dataset.setting] = setting.checked; toast('Préférence enregistrée'); } catch (error) { setting.checked = !setting.checked; toast(error.message); }
  });
  root.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target.closest('[data-form]'), values = Object.fromEntries(new FormData(form)), kind = form.dataset.form, button = form.querySelector('button');
    button.disabled = true;
    try {
      if (kind === 'nickname') { const nickname = await accountApi.changeNickname(String(values.nickname).trim()); getState().profile.nickname = nickname; data.profile.nickname = nickname; deps.onNickname?.(nickname); toast('Pseudo modifié'); render(); }
      else if (kind === 'email') { await accountApi.updateEmail(String(values.email).trim()); form.reset(); toast('Lien de confirmation envoyé à la nouvelle adresse'); }
      else if (kind === 'password') { await accountApi.auth.updatePassword(String(values.password)); form.reset(); toast('Mot de passe modifié'); }
      else if (kind === 'delete') { await accountApi.deleteAccount(String(values.confirm)); toast('Votre compte a été supprimé'); onLoggedOut(); }
    } catch (error) { toast(error.message); }
    button.disabled = false;
  });
  return { show, refresh: () => target && show(target), stop: cleanup };
}
