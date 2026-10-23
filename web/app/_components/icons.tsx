// Thin line icons drawn to match the walking drawing design. They are always
// decorative: the text beside them carries the meaning.
const Icon = ({
  size,
  children,
}: {
  size: number;
  children: React.ReactNode;
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const ArrowRight = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </Icon>
);

export const ChevronRight = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <path d="m9 5 7 7-7 7" />
  </Icon>
);

export const MenuIcon = ({ size = 26 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </Icon>
);

export const ArrowLeft = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M20 12H4M10 6l-6 6 6 6" />
  </Icon>
);

export const ChevronLeft = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <path d="m15 5-7 7 7 7" />
  </Icon>
);

export const PictureIcon = ({ size = 44 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3" y="4" width="18" height="16" rx="1.5" />
    <circle cx="15.5" cy="9" r="1.6" />
    <path d="m4 18 5.5-6 4 4 2.5-2.5L20 18" />
  </Icon>
);

export const PlusIcon = ({ size = 24 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 4v16M4 12h16" strokeWidth={2.6} />
  </Icon>
);

export const PinIcon = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2Z"
    />
  </svg>
);

export const InfoIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="M12 10.5v6M12 7.2v.1" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);
