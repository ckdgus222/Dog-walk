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
