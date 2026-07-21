import logoUrl from '../../assets/atlas-links.svg?no-inline';

type LogoProps = {
  className?: string;
  label?: string;
};

export function Logo({ className = '', label }: LogoProps) {
  return (
    <img
      className={`brand-logo ${className}`.trim()}
      src={logoUrl}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
    />
  );
}
