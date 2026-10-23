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

export const CloseIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M6 6l12 12M18 6 6 18" />
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

export const LockIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h1Zm2 0h6V7a3 3 0 0 0-6 0v3Z"
    />
  </svg>
);

export const LockLineIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 14.5v2.5" />
  </Icon>
);

export const CameraIcon = ({ size = 48 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M9 4h6l1.6 2.4H20a1.5 1.5 0 0 1 1.5 1.5v10.6A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V7.9A1.5 1.5 0 0 1 4 6.4h3.4L9 4Zm3 4.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Zm0 2a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z"
    />
  </svg>
);

export const CalendarIcon = ({ size = 20 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="3.5" y="5" width="17" height="15" rx="1.5" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4M8 13h2M14 13h2M8 16.5h2" />
  </Icon>
);

export const ChevronDown = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="m5 9 7 7 7-7" />
  </Icon>
);

export const ChatIcon = ({ size = 16 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </Icon>
);
