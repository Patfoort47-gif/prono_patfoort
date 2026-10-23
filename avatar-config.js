// Avatar 3D v2 (BET-49) : configuration versionnée, validation stricte, migration des anciens avatars et verrous des options.
// Fonctions pures, sans DOM ni Three.js : utilisées par avatar.js (scène), avatar-studio.js (interface) et account.js (enregistrement).
// supabase-v17-schema.sql (fonction avatar_config_valid) applique les mêmes règles côté serveur : les garder identiques.
import { CATALOG } from './shop.js';

export const AVATAR_VERSION = 2;
export const BODIES = [['m', 'Homme'], ['f', 'Femme']];
export const SKINS = [['#fbdcc4', 'Porcelaine'], ['#f0be98', 'Sable'], ['#d49a6a', 'Miel'], ['#a9693f', 'Cuivre'], ['#6b4128', 'Ébène']];
export const FACES = [['round', 'Ronde'], ['oval', 'Ovale'], ['long', 'Allongée'], ['square', 'Carrée'], ['heart', 'Cœur'], ['wide', 'Large']];
export const EYES = [['#3b82f6', 'Bleu'], ['#16a34a', 'Vert'], ['#8a5a2b', 'Noisette'], ['#3a2f2a', 'Brun'], ['#7b8794', 'Gris'], ['#9b5de5', 'Violet']];
export const EXPRESSIONS = [['smile', 'Sourire'], ['focus', 'Concentré'], ['wink', 'Clin d’œil'], ['confident', 'Confiant'], ['joy', 'Joie'], ['surprise', 'Surprise']];
export const HAIRS = [['short', 'Court'], ['fade', 'Dégradé'], ['mohawk', 'Crête'], ['afro', 'Afro'], ['bun', 'Chignon'], ['shaved', 'Rasé'], ['curls', 'Boucles'], ['long', 'Longs attachés'], ['braids', 'Tresses'], ['quiff', 'Mèche'], ['curly', 'Bouclé court'], ['ponytail', 'Queue de cheval']];
export const HAIR_COLORS = [['#17171c', 'Noir'], ['#3a2316', 'Brun foncé'], ['#6b4429', 'Châtain'], ['#d8b062', 'Blond'], ['#b34a1f', 'Roux'], ['#b8bcc4', 'Argent'], ['#2b4fd6', 'Bleu'], ['#d6338f', 'Rose'], ['#c6ff3d', 'Vert citron']];
export const LIME_HAIR = 8;
export const BOOTS = [['#16181a', 'Noir'], ['#f4f4f0', 'Blanc'], ['#ff5a36', 'Orange'], ['#2f6bff', 'Bleu']];
export const POSES = [['idle', 'Attente'], ['arms', 'Bras croisés'], ['ball', 'Ballon sous le bras'], ['foot', 'Pied sur le ballon']];
export const MAX_ACCESSORIES = 5, MAX_SHOWCASE = 3, MAX_NAME = 12;
export const NAME_RE = /^[A-Z0-9 .-]{0,12}$/;

// Maillots : couleurs de départ gratuites (les quatre couleurs historiques), puis maillots de la boutique et maillots débloqués par division.
export const KITS = {
  'start-lime': { name: 'Maillot de départ · Lime', pattern: 'plain', c1: '#b7f02a', c2: '#101411', free: true },
  'start-blue': { name: 'Maillot de départ · Bleu', pattern: 'plain', c1: '#2f6bff', c2: '#f4f4f0', free: true },
  'start-purple': { name: 'Maillot de départ · Violet', pattern: 'plain', c1: '#8b5cf6', c2: '#f4f4f0', free: true },
  'start-orange': { name: 'Maillot de départ · Orange', pattern: 'plain', c1: '#ff8a1f', c2: '#101411', free: true },
  'kit-plain-lime': { pattern: 'plain', c1: '#c6ff3d', c2: '#101411' }, 'kit-plain-blue': { pattern: 'plain', c1: '#1e56e6', c2: '#f4f4f0' }, 'kit-plain-red': { pattern: 'plain', c1: '#e02424', c2: '#f4f4f0' },
  'kit-plain-white': { pattern: 'plain', c1: '#f4f4f0', c2: '#1e56e6' }, 'kit-plain-black': { pattern: 'plain', c1: '#17191b', c2: '#c6ff3d' }, 'kit-plain-orange': { pattern: 'plain', c1: '#ff7a00', c2: '#101411' },
  'kit-stripe-vertical': { pattern: 'vertical', c1: '#d62828', c2: '#f4f4f0' }, 'kit-stripe-band': { pattern: 'band', c1: '#f4f4f0', c2: '#1e56e6' }, 'kit-stripe-hoops': { pattern: 'hoops', c1: '#12994a', c2: '#f4f4f0' }, 'kit-stripe-scarf': { pattern: 'scarf', c1: '#6d28d9', c2: '#facc15' },
  'kit-retro-70': { pattern: 'retro70', c1: '#f08a1c', c2: '#f4f0e2' }, 'kit-retro-90': { pattern: 'retro90', c1: '#0e9aa7', c2: '#a855f7' }, 'kit-retro-champion': { pattern: 'legend', c1: '#14161a', c2: '#e6b422' },
  'kit-champion': { pattern: 'champion', c1: '#e6b422', c2: '#14161a' }, 'kit-gold': { name: 'Maillot or', pattern: 'champion', c1: '#d9a520', c2: '#2a1f08', unlock: 'maillot or' }
};
export const START_KITS = Object.keys(KITS).filter(id => KITS[id].free);
export const SOLID_BACKGROUNDS = [['solid-0', 'Citron', '#d7ff4a', '#7bb800'], ['solid-1', 'Nuit', '#2b3a67', '#0b1020'], ['solid-2', 'Pourpre', '#8b5cf6', '#2a1459'], ['solid-3', 'Rouge', '#ff5a4a', '#8c1111'], ['solid-4', 'Océan', '#36c2d9', '#08475a'], ['solid-5', 'Graphite', '#5a6360', '#141716']];
// Éléments débloqués par une division atteinte (table player_unlocks) : le nom stocké en base, puis l'identifiant d'avatar correspondant.
export const UNLOCK_IDS = { 'socle argent': 'base-silver', 'maillot or': 'kit-gold', 'cheveux vert citron': 'hair-lime', couronne: 'acc-crown' };
export const UNLOCK_LABELS = { 'base-silver': 'Débloqué en division National', 'kit-gold': 'Débloqué en division Pro', 'hair-lime': 'Débloqué en division Élite', 'acc-crown': 'Réservé aux joueurs Master' };
export const FREE_BASES = ['base-classic'], BASES = [['base-classic', 'Classique'], ['base-grass', 'Gazon'], ['base-silver', 'Argent'], ['base-gold', 'Or'], ['base-neon', 'Néon']];
export const FREE_CELEBRATIONS = ['celeb-jump'], CELEBRATIONS = [['celeb-jump', 'Saut de joie'], ['celeb-fist', 'Poing levé'], ['celeb-slide', 'Glissade à genoux'], ['celeb-flip', 'Salto']];
export const ACCESSORIES = [['acc-captain', 'Brassard de capitaine', 'arm'], ['acc-cap', 'Casquette', 'head'], ['acc-headband', 'Bandeau', 'head'], ['acc-crown', 'Couronne du Master', 'head'], ['acc-glasses', 'Lunettes', 'face'], ['acc-headphones', 'Casque audio', 'ears'], ['acc-scarf', 'Écharpe de supporter', 'neck']];
export const TROPHIES = [['trophy-cup', 'Coupe des champions'], ['trophy-pichichi', 'Pichichi'], ['trophy-boot', 'Soulier d’or'], ['trophy-glove', 'Gant d’or'], ['trophy-ball', 'Ballon d’or']];
export const STADIUMS = [['rio', 'Rio'], ['barcelona', 'Barcelone'], ['madrid', 'Madrid'], ['paris', 'Paris'], ['munich', 'Munich'], ['london', 'Londres']];
export const SCENES = [['bg-training', 'Centre d’entraînement'], ['bg-lockers', 'Vestiaire'], ['bg-tunnel', 'Tunnel des joueurs'], ...STADIUMS.flatMap(([key, label]) => [[`bg-${key}-in`, `Stade de ${label}, intérieur`], [`bg-${key}-out`, `Stade de ${label}, extérieur`]])];

const idOf = list => list.map(entry => entry[0]);
const ENUMS = { kit: Object.keys(KITS), base: idOf(BASES), background: [...idOf(SOLID_BACKGROUNDS), ...idOf(SCENES)], celebration: idOf(CELEBRATIONS), accessory: idOf(ACCESSORIES), trophy: idOf(TROPHIES) };
const int = (value, max, fallback = 0) => Number.isInteger(value) && value >= 0 && value <= max ? value : fallback;
const pick = (value, list, fallback) => list.includes(value) ? value : fallback;

export const defaultAvatar = () => ({ v: AVATAR_VERSION, body: 'm', skin: 1, face: 1, eyes: 0, expression: 'smile', hair: 0, hairColor: 1, kit: { item: 'start-lime', number: 10, name: '' }, boots: 0, pose: 'idle', accessories: [], base: 'base-classic', background: 'solid-1', showcase: [], celebration: 'celeb-jump', rev: 0 });

// Une seule pièce par emplacement (tête, visage, oreilles, cou, bras) et cinq accessoires au plus.
export function cleanAccessories(list) {
  const seen = new Set(), result = [];
  for (const id of Array.isArray(list) ? list : []) {
    const entry = ACCESSORIES.find(item => item[0] === id);
    if (!entry || seen.has(entry[2]) || result.includes(id)) continue;
    seen.add(entry[2]); result.push(id);
    if (result.length >= MAX_ACCESSORIES) break;
  }
  return result;
}
// Remet n'importe quelle valeur (JSON de la base, du stockage local, d'un autre joueur) sous une forme valide : jamais d'erreur, jamais d'identifiant inconnu.
export function sanitizeAvatar(raw) {
  const base = defaultAvatar();
  if (!raw || typeof raw !== 'object' || raw.v !== AVATAR_VERSION) return raw && typeof raw === 'object' && raw.v == null ? migrateAvatar(raw) : base;
  const kit = raw.kit && typeof raw.kit === 'object' ? raw.kit : {}, name = typeof kit.name === 'string' ? kit.name.toUpperCase().replace(/[^A-Z0-9 .-]/g, '').slice(0, MAX_NAME) : '';
  return {
    v: AVATAR_VERSION, body: pick(raw.body, ['m', 'f'], base.body), skin: int(raw.skin, SKINS.length - 1, base.skin), face: int(raw.face, FACES.length - 1, base.face), eyes: int(raw.eyes, EYES.length - 1, base.eyes),
    expression: pick(raw.expression, idOf(EXPRESSIONS), base.expression), hair: int(raw.hair, HAIRS.length - 1, base.hair), hairColor: int(raw.hairColor, HAIR_COLORS.length - 1, base.hairColor),
    kit: { item: pick(kit.item, ENUMS.kit, base.kit.item), number: Number.isInteger(kit.number) && kit.number >= 0 && kit.number <= 99 ? kit.number : null, name },
    boots: int(raw.boots, BOOTS.length - 1, base.boots), pose: pick(raw.pose, idOf(POSES), base.pose), accessories: cleanAccessories(raw.accessories),
    base: pick(raw.base, ENUMS.base, base.base), background: pick(raw.background, ENUMS.background, base.background),
    showcase: [...new Set((Array.isArray(raw.showcase) ? raw.showcase : []).filter(id => ENUMS.trophy.includes(id)))].slice(0, MAX_SHOWCASE),
    celebration: pick(raw.celebration, ENUMS.celebration, base.celebration), rev: Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : 0
  };
}
// Ancien avatar (couleur, expression, accessoire) converti sans perte : la couleur devient le maillot de départ, la couronne n'est conservée que par un Master.
export function migrateAvatar(old = {}, { master = false } = {}) {
  const config = defaultAvatar(), color = ['lime', 'blue', 'purple', 'orange'].includes(old.avatar) ? old.avatar : 'lime';
  config.kit.item = `start-${color}`;
  config.expression = { smile: 'smile', cool: 'confident', focused: 'focus', wink: 'wink' }[old.face] ?? 'smile';
  const accessory = { glasses: 'acc-glasses', cap: 'acc-cap', crown: master ? 'acc-crown' : null }[old.accessory];
  config.accessories = accessory ? [accessory] : [];
  return config;
}
// Version simplifiée pour les écrans qui n'affichent pas la 3D (repli sans image) : couleur, expression et accessoire de l'ancien avatar.
export function legacyView(config) {
  const value = sanitizeAvatar(config), kit = KITS[value.kit.item];
  const color = { 'start-lime': 'lime', 'start-blue': 'blue', 'start-purple': 'purple', 'start-orange': 'orange' }[value.kit.item] ?? (/^#[0-9a-f]{6}$/i.test(kit?.c1 ?? '') ? nearestLegacy(kit.c1) : 'lime');
  const face = { smile: 'smile', confident: 'cool', focus: 'focused', wink: 'wink', joy: 'smile', surprise: 'smile' }[value.expression];
  const accessory = value.accessories.includes('acc-crown') ? 'crown' : value.accessories.includes('acc-cap') ? 'cap' : value.accessories.includes('acc-glasses') ? 'glasses' : 'none';
  return { avatar: color, face, accessory };
}
const LEGACY_COLORS = { lime: [183, 240, 42], blue: [47, 107, 255], purple: [139, 92, 246], orange: [255, 138, 31] };
function nearestLegacy(hex) {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return Object.entries(LEGACY_COLORS).map(([key, color]) => [key, color.reduce((sum, channel, i) => sum + (channel - rgb[i]) ** 2, 0)]).sort((a, b) => a[1] - b[1])[0][0];
}
// Validation stricte (même règle que la fonction SQL) : renvoie la liste des erreurs, vide si la configuration est acceptée telle quelle.
export function validateAvatar(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ['Configuration absente'];
  if (JSON.stringify(raw).length > 1500) errors.push('Configuration trop volumineuse');
  if (raw.v === 1 || raw.v == null) return errors.length ? errors : (['lime', 'blue', 'purple', 'orange'].includes(raw.avatar) && ['smile', 'cool', 'focused', 'wink'].includes(raw.face) && ['none', 'glasses', 'cap', 'crown'].includes(raw.accessory) ? [] : ['Ancien avatar invalide']);
  if (raw.v !== AVATAR_VERSION) return ['Version inconnue'];
  const clean = sanitizeAvatar(raw);
  for (const key of ['body', 'skin', 'face', 'eyes', 'expression', 'hair', 'hairColor', 'boots', 'pose', 'base', 'background', 'celebration']) if (raw[key] !== clean[key]) errors.push(`Valeur invalide : ${key}`);
  if (JSON.stringify(raw.kit) !== JSON.stringify(clean.kit)) errors.push('Maillot invalide');
  if (JSON.stringify(raw.accessories) !== JSON.stringify(clean.accessories)) errors.push('Accessoires invalides');
  if (JSON.stringify(raw.showcase) !== JSON.stringify(clean.showcase)) errors.push('Vitrine invalide');
  return errors;
}

// Identifiants payants ou débloqués par division que la configuration utilise : le serveur vérifie qu'ils sont possédés.
export function restrictedIds(config) {
  const value = sanitizeAvatar(config), list = [];
  if (!KITS[value.kit.item]?.free) list.push(value.kit.item);
  list.push(...value.accessories);
  if (!FREE_BASES.includes(value.base)) list.push(value.base);
  if (!value.background.startsWith('solid-')) list.push(value.background);
  list.push(...value.showcase);
  if (!FREE_CELEBRATIONS.includes(value.celebration)) list.push(value.celebration);
  if (value.hairColor === LIME_HAIR) list.push('hair-lime');
  return list;
}
// Identifiants possédés : inventaire de la boutique et éléments débloqués par division.
export const ownedIds = (inventory = [], unlocks = []) => new Set([...inventory, ...unlocks.map(name => UNLOCK_IDS[name]).filter(Boolean)]);
// Retire d'une configuration ce que le joueur ne possède pas (l'essayage reste local, l'enregistrement ne garde que le possédé).
export function stripUnowned(config, owned) {
  const value = sanitizeAvatar(config), dropped = [], keep = id => owned.has(id) || (dropped.push(id), false);
  if (!KITS[value.kit.item]?.free && !keep(value.kit.item)) value.kit.item = 'start-lime';
  value.accessories = value.accessories.filter(keep);
  if (!FREE_BASES.includes(value.base) && !keep(value.base)) value.base = 'base-classic';
  if (!value.background.startsWith('solid-') && !keep(value.background)) value.background = 'solid-1';
  value.showcase = value.showcase.filter(keep);
  if (!FREE_CELEBRATIONS.includes(value.celebration) && !keep(value.celebration)) value.celebration = 'celeb-jump';
  if (value.hairColor === LIME_HAIR && !keep('hair-lime')) value.hairColor = 1;
  return { config: value, dropped };
}
// Verrou d'une option : null si elle est libre ou possédée, sinon la condition à afficher (division, prix en jetons, objet exclusif).
export function lockOf(id, owned, catalog = CATALOG) {
  if (!id || owned.has(id)) return null;
  if (UNLOCK_LABELS[id]) return { kind: 'division', label: UNLOCK_LABELS[id] };
  const entry = catalog.find(item => item.id === id);
  if (!entry) return null;
  if (entry.exclusive) return { kind: 'exclusive', label: 'Objet exclusif' };
  return { kind: 'shop', price: entry.price, name: entry.name };
}
export const isFreeOption = id => !id || START_KITS.includes(id) || FREE_BASES.includes(id) || FREE_CELEBRATIONS.includes(id) || String(id).startsWith('solid-');

// Adresse de l'image de l'avatar (buste ou en pied) dans Supabase Storage : le numéro de version évite de garder une ancienne image en cache.
export const avatarImageUrl = (supabaseUrl, userId, rev, kind = 'bust') => /^[0-9a-f-]{36}$/i.test(String(userId)) && rev > 0 && /^https:\/\/[a-z0-9.-]+$/i.test(String(supabaseUrl).replace(/\/$/, '')) ? `${String(supabaseUrl).replace(/\/$/, '')}/storage/v1/object/public/avatars/${userId}/${kind === 'full' ? 'full' : 'bust'}?v=${rev}` : null;
// Niveau de qualité selon l'appareil : « haut » pour un ordinateur, « moyen » pour un téléphone ou un appareil modeste.
export function qualityFor({ coarse = false, memory = 8, cores = 8, saveData = false } = {}) { return saveData ? 'low' : coarse || memory <= 4 || cores <= 4 ? 'mid' : 'high'; }
export const QUALITY = { high: { pixelRatio: 2, shadow: 2048, segments: 48, msaa: true, glow: true }, mid: { pixelRatio: 1.5, shadow: 1024, segments: 28, msaa: true, glow: false }, low: { pixelRatio: 1, shadow: 512, segments: 20, msaa: false, glow: false } };

// Catégories de la boutique qui s'affichent sur l'avatar 3D (les titres et cadres de carte, eux, restent des emplacements équipés).
export const AVATAR_CATEGORIES = ['kit', 'accessory', 'trophy', 'base', 'background', 'celebration'];
// Met un objet de la boutique sur l'avatar (essayage ou port) : remplace l'élément de même emplacement, ajoute un trophée à la vitrine (trois au plus).
export function applyItem(config, id) {
  const value = sanitizeAvatar(config), accessory = ACCESSORIES.find(entry => entry[0] === id);
  if (KITS[id] && !KITS[id].free) value.kit.item = id;
  else if (START_KITS.includes(id)) value.kit.item = id;
  else if (accessory) value.accessories = cleanAccessories([...value.accessories.filter(other => ACCESSORIES.find(entry => entry[0] === other)?.[2] !== accessory[2]), id]);
  else if (ENUMS.trophy.includes(id)) value.showcase = [...value.showcase.filter(other => other !== id), id].slice(-MAX_SHOWCASE);
  else if (ENUMS.base.includes(id)) value.base = id;
  else if (ENUMS.background.includes(id)) value.background = id;
  else if (ENUMS.celebration.includes(id)) value.celebration = id;
  else if (id === 'hair-lime') value.hairColor = LIME_HAIR;
  return sanitizeAvatar(value);
}
// Retire un objet de l'avatar : retour à l'option gratuite de l'emplacement.
export function removeItem(config, id) {
  const value = sanitizeAvatar(config);
  if (value.kit.item === id) value.kit.item = 'start-lime';
  value.accessories = value.accessories.filter(other => other !== id); value.showcase = value.showcase.filter(other => other !== id);
  if (value.base === id) value.base = 'base-classic'; if (value.background === id) value.background = 'solid-1'; if (value.celebration === id) value.celebration = 'celeb-jump';
  if (id === 'hair-lime' && value.hairColor === LIME_HAIR) value.hairColor = 1;
  return value;
}
export const isWorn = (config, id) => restrictedIds(config).includes(id) || sanitizeAvatar(config).kit.item === id;
// Objets de la boutique que la configuration utilise, sous forme d'une liste de libellés (essayage : « non enregistré »).
export const unownedIds = (config, owned) => restrictedIds(config).filter(id => !owned.has(id));
