/**
 * Normalisation des textes pour la recherche.
 *
 * Deux pièges rencontrés sur le terrain, tous deux réglés ici :
 *
 *  1. Feller écrit « 3×T13 » avec le signe multiplication typographique (U+00D7),
 *     que personne ne tape au clavier.
 *  2. On tape « sch3 » et le catalogue dit « sch. 3 » : un point et une espace
 *     suffisaient à ne rien trouver.
 *
 * D'où la règle : on compare des chaînes **réduites aux lettres et aux chiffres**,
 * sans accents, sans ponctuation, sans espaces. « sch. 3 » et « sch3 » deviennent
 * la même chose, « 3×T13 » et « 3xt13 » aussi.
 */

/** Minuscules, sans accents, le signe × ramené à un x. */
function base(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[×✕✖]/g, 'x')
}

/** Réduit aux lettres et aux chiffres : plus de point, tiret, espace ni slash. */
export function reduire(texte: string): string {
  return base(texte).replace(/[^a-z0-9]/g, '')
}

/** Feller écrit « ENC » et « AP », pas « encastré » et « apparent ». */
const SYNONYMES: Record<string, string> = {
  apparent: 'ap',
  saillie: 'ap',
  encastre: 'enc',
  inter: 'interrupteur',
  vierge: 'obturation',
  obturateur: 'obturation',
}

/**
 * Découpe la requête en mots réduits. On coupe sur les espaces seulement :
 * « sch3 » reste un mot entier, sinon on perdrait le lien entre « sch » et « 3 ».
 */
export function motsCles(requete: string): string[] {
  return base(requete)
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => SYNONYMES[m] ?? m)
    .map(reduire)
    .filter(Boolean)
}

/** Vrai si tous les mots de la requête se retrouvent dans le texte réduit. */
export function correspond(texte: string, mots: string[]): boolean {
  const foin = reduire(texte)
  return mots.every((m) => foin.includes(m))
}
