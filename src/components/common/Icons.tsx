import type { ReactNode, SVGProps } from 'react'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
}

interface IconDefinitionProps extends IconProps {
  children: ReactNode
}

function Icon({ size = 16, children, ...rest }: IconDefinitionProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function IconLogo({ size = 22, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <rect x="1" y="1" width="22" height="22" rx="5.5" fill="#111820" stroke="#26313d" />
      <path
        d="M6.4 16.6V7.4h5.3a2.5 2.5 0 0 1 .45 4.96L14.5 16.6h-2l-2.1-2.6H8.3v2.6H6.4Zm1.9-4h3.3a1.15 1.15 0 0 0 0-2.3H8.3v2.3Z"
        fill="#58a6ff"
      />
      <circle cx="17" cy="12.4" r="1.9" fill="#3fb950" />
    </svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function IconSettings(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2.6 15a1.7 1.7 0 0 0-1.6-1H.8a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 4.6h.1A1.7 1.7 0 0 0 8.3 3v-.2a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z" />
    </Icon>
  )
}

export function IconMenu(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
    </Icon>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icon>
  )
}

export function IconChevron(props: IconProps & { open?: boolean }) {
  const { open, style, ...rest } = props
  return (
    <Icon {...rest} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease', ...style }}>
      <path d="M9 5l7 7-7 7" />
    </Icon>
  )
}

export function IconSend(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12h13M12 5.5l6.5 6.5-6.5 6.5" />
    </Icon>
  )
}

export function IconStop(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function IconCopy(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5.5A1.5 1.5 0 0 1 6.5 4H15" />
    </Icon>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Icon>
  )
}

export function IconRefresh(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20 4v4h-4" />
    </Icon>
  )
}

export function IconTerminal(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7.5 10l2.5 2.5-2.5 2.5M13 15h4" />
    </Icon>
  )
}

export function IconFile(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5L13.5 3Z" />
      <path d="M13.5 3v5.5H19" />
    </Icon>
  )
}

export function IconWrench(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.7 6.3a4.5 4.5 0 0 0 5.9 5.9L21 21l-7.4-.4a4.5 4.5 0 0 1-5.9-5.9" />
      <path d="M9.5 12.5 3.6 18.4a1.9 1.9 0 1 0 2.7 2.7l5.9-5.9" />
    </Icon>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </Icon>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7" />
    </Icon>
  )
}

export function IconEdit(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15.5 4.5l4 4L8 20H4v-4L15.5 4.5Z" />
      <path d="M13.5 6.5l4 4" />
    </Icon>
  )
}

export function IconWarning(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5M12 17h.01" />
    </Icon>
  )
}

export function IconInfo(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 8h.01" />
    </Icon>
  )
}

export function IconPlug(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3v6M15 3v6" />
      <path d="M6 9h12v2a6 6 0 0 1-6 6 6 6 0 0 1-6-6V9Z" />
      <path d="M12 17v4" />
    </Icon>
  )
}

export function IconPlugOff(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v2.5a6 6 0 0 1-2.8 5.1" />
      <path d="M12 16.5V21" />
      <path d="M4 4l16 16" />
    </Icon>
  )
}

export function IconArrowDown(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Icon>
  )
}

export function IconFolder(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4l2 2.5h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-11Z" />
    </Icon>
  )
}

export function IconList(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h10M4 12h16M4 17h12" />
    </Icon>
  )
}

export function IconChat(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12.5a7.5 7.5 0 0 1-10.9 6.7L4.5 20.5l1.3-4.6A7.5 7.5 0 1 1 20 12.5Z" />
    </Icon>
  )
}
