import type { Affaire } from '../db/schema'

/**
 * Export d'un rendez-vous vers l'agenda du téléphone (fichier .ics).
 *
 * C'est LA façon d'obtenir une notification une heure avant, aujourd'hui, sans
 * serveur : on ne cherche pas à réveiller l'app, on confie le rappel à l'agenda
 * du téléphone, qui sait le faire depuis toujours — hors ligne, app fermée,
 * téléphone en poche, écran verrouillé.
 *
 * Une vraie notification poussée par l'app demanderait un serveur qui l'envoie
 * à l'heure dite ; c'est pour quand Supabase sera branché.
 */

const HORODATAGE = (d: Date) =>
  d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Les retours à la ligne et les virgules ont un sens dans un .ics. */
const echapper = (t: string) =>
  t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

export const LIBELLE_TYPE: Record<string, string> = {
  chantier: 'Chantier',
  depannage: 'Dépannage',
  remise_conformite: 'Remise en conformité',
}

export function construireIcs(affaire: Affaire, rappelMinutes = 60): string | null {
  if (!affaire.rendez_vous) return null
  const debut = new Date(affaire.rendez_vous)
  const fin = new Date(debut.getTime() + (affaire.duree_min ?? 60) * 60000)

  const lieu = [affaire.adresse, affaire.localite].filter(Boolean).join(', ')
  const details = [
    affaire.numero_affaire ? `N° affaire : ${affaire.numero_affaire}` : '',
    affaire.notes ?? '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chantier//Agenda//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${affaire.id}@chantier`,
    `DTSTAMP:${HORODATAGE(new Date())}`,
    `DTSTART:${HORODATAGE(debut)}`,
    `DTEND:${HORODATAGE(fin)}`,
    `SUMMARY:${echapper(`${LIBELLE_TYPE[affaire.type] ?? 'Intervention'} — ${affaire.nom}`)}`,
    lieu ? `LOCATION:${echapper(lieu)}` : '',
    details ? `DESCRIPTION:${echapper(details)}` : '',
    // Le rappel : c'est cette ligne qui fait sonner le téléphone.
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `TRIGGER:-PT${rappelMinutes}M`,
    `DESCRIPTION:${echapper(affaire.nom)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
}

export function ajouterAAgenda(affaire: Affaire, rappelMinutes = 60) {
  const ics = construireIcs(affaire, rappelMinutes)
  if (!ics) return
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `rdv-${affaire.nom.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.ics`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** « dans 45 min », « dans 3 h », « il y a 20 min »… */
export function delaiRelatif(iso: string, maintenant = Date.now()): string {
  const minutes = Math.round((new Date(iso).getTime() - maintenant) / 60000)
  const abs = Math.abs(minutes)
  const texte =
    abs < 60
      ? `${abs} min`
      : abs < 60 * 24
        ? `${Math.round(abs / 60)} h`
        : `${Math.round(abs / (60 * 24))} j`
  return minutes >= 0 ? `dans ${texte}` : `il y a ${texte}`
}

export function memeJour(iso: string, jour: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === jour.getFullYear() &&
    d.getMonth() === jour.getMonth() &&
    d.getDate() === jour.getDate()
  )
}

export const heure = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })

export const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-CH', { weekday: 'short', day: '2-digit', month: '2-digit' })
