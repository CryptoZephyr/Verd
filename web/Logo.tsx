type LogoMarkProps = {
  className?: string;
  title?: string;
};

export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={className}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      <path d="M37 59C37 49 43 43 54 43" stroke="currentColor" strokeLinecap="round" strokeWidth="9" />
      <path d="M60 36C60 26 66 20 77 20" stroke="currentColor" strokeLinecap="round" strokeWidth="9" />
      <circle cx="29" cy="68" fill="currentColor" r="13" />
      <circle cx="55" cy="42" fill="currentColor" r="13" />
      <circle cx="81" cy="16" fill="currentColor" r="13" />
    </svg>
  );
}
