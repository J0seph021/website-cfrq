import { LOGO_LABEL, LOGO_TRACES, LOGO_VIEWBOX } from "./logo-traces";

// Même logo que Logo.astro, pour les composants React (en-tête de l'espace client).
export default function Logo({ className = "h-7 w-auto" }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={LOGO_LABEL}>
      <g transform="translate(1 0)">
        {LOGO_TRACES.map((t, i) => <path key={i} fill={t.fill} fillRule="evenodd" transform={t.transform} d={t.d} />)}
      </g>
    </svg>
  );
}
