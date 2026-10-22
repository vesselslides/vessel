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
