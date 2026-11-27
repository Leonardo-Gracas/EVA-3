import { RELEASES, VERSION, releaseDate } from './releases';

/** Notas de atualização: o que mudou para quem usa, da versão mais nova para a mais antiga. */
export default function ReleaseNotes() {
  return (
    <div className="section release-notes">
      {RELEASES.map((r) => (
        <article key={r.version} className={`card${r.version === VERSION ? ' card-gold' : ''}`}>
          <header className="release-head">
            <span className="badge badge-gold">v{r.version}</span>
            <strong className="grow">{r.title}</strong>
            <span className="tiny muted">{releaseDate(r)}</span>
          </header>
          <ul className="release-list">
            {r.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </article>
      ))}
    </div>
  );
}
