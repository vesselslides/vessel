// Small line icons, drawn in the text colour so they match buttons and themes.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }): React.JSX.Element {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const speaker = 'M4 9.5h3.2L12 5.5v13l-4.8-4H4z';

export const SoundIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d={speaker} />
    <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
    <path d="M18.2 6.6a7.6 7.6 0 0 1 0 10.8" />
  </Icon>
);

export const MutedIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d={speaker} />
    <path d="M16 9.5l5 5M21 9.5l-5 5" />
  </Icon>
);

export const PlayIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M8 5.5v13l10.5-6.5z" />
  </Icon>
);

export const PauseIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M9 5.5v13M15 5.5v13" />
  </Icon>
);

export const StopIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
  </Icon>
);

export const LoopIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M17 3.5l3 3-3 3" />
    <path d="M4 11.5v-1a4 4 0 0 1 4-4h12" />
    <path d="M7 20.5l-3-3 3-3" />
    <path d="M20 12.5v1a4 4 0 0 1-4 4H4" />
  </Icon>
);

export const SettingsIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
);

export const MusicIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M9 18V6l11-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </Icon>
);

export const WarningIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4.2M12 17h.01" />
  </Icon>
);

export const RestartIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M6.5 5.5v13" />
    <path d="M18 5.5v13l-9-6.5z" />
  </Icon>
);

// Toolbar

export const NewSongIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M13.5 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8.5z" />
    <path d="M13.5 3.5v5h5" />
    <path d="M12 11.5v6M9 14.5h6" />
  </Icon>
);

export const OpenIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5h-7L10 5H5a1.5 1.5 0 0 0-1.5 1.5z" />
  </Icon>
);

export const ImportIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 3.5v10.5M8 10l4 4 4-4" />
    <path d="M4.5 14.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
  </Icon>
);

export const PlaylistIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M4.5 6.5h11M4.5 11.5h11M4.5 16.5h7" />
    <path d="M17.5 14v5.5l3-2.75z" />
  </Icon>
);

export const BibleIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 6.5c-1.8-1.3-4.5-2-7.5-2v13c3 0 5.7.7 7.5 2 1.8-1.3 4.5-2 7.5-2v-13c-3 0-5.7.7-7.5 2z" />
    <path d="M12 6.5v13" />
  </Icon>
);

export const ThemesIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.1 0 1.8-.8 1.8-1.7 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1a4.3 4.3 0 0 0 4.3-4.3c0-3.7-4-6.7-9-6.7z" />
    <circle cx="7.5" cy="11" r="1" />
    <circle cx="10" cy="7.3" r="1" />
    <circle cx="14.5" cy="7.3" r="1" />
  </Icon>
);

export const RemoteIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 17.5h2" />
  </Icon>
);

export const SaveIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <path d="M5 4.5h11.5l3 3V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5z" />
    <path d="M7.5 4.5v4h7v-4M7.5 19.5v-6h9v6" />
  </Icon>
);

export const ScreensIcon = (p: IconProps): React.JSX.Element => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
    <path d="M9 20h6M12 16.5V20" />
  </Icon>
);
