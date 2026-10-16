import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

/** Pixelart icon: Android Robot (replaces robot emoji) */
export function PixelRobot({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M5 2h1v2H5V2zm5 0h1v2h-1V2zM4 4h8v1H4V4zm-1 2h10v6H3V6zm2 2h2v2H5V8zm4 0h2v2H9V8zm-4 4h6v1H5v-1zm-3-3h1v3H2V9zm11 0h1v3h-1V9zm-8 4h2v2H5v-2zm4 0h2v2H9v-2z" />
    </svg>
  );
}

/** Pixelart icon: Lightbulb (replaces bulb emoji) */
export function PixelLightbulb({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M6 1h4v1H6V1zm-2 2h8v1H4V3zm-1 2h10v4H3V5zm1 4h8v1H4V9zm1 2h6v1H5v-1zm1 2h4v2H6v-2z" />
    </svg>
  );
}

/** Pixelart icon: Zap / Lightning Bolt (replaces bolt emoji) */
export function PixelZap({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M9 1H4v6h3v1H4v1h2v1H5v1h2v1H6v1h2v1H7v1h2v1h1v-6H7V7h3V6H8V5h2V4H9V1z" />
    </svg>
  );
}

/** Pixelart icon: Play (replaces play emoji) */
export function PixelPlay({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M4 2h2v1H4V2zm2 1h2v1H6V3zm2 1h2v1H8V4zm2 1h2v1h-2V5zm2 1h2v4h-2V6zm-2 4h-2v1h2v-1zm-2 1H8v1h2v-1zm-2 1H6v1h2v-1zm-2 1H4v1h2v-1zm-2-9h2v8H2V4h2V3z" />
    </svg>
  );
}

/** Pixelart icon: Clock (replaces clock emoji) */
export function PixelClock({ size = 16, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M6 1h4v1H6V1zm-3 2h10v1H3V3zm-1 2h12v6H2V5zm1 6h10v1H3v-1zm3 2h4v1H6v-1zM7 5h2v3h3v2H7V5z" />
    </svg>
  );
}

/** Pixelart icon: Info (i in box/circle) */
export function PixelInfo({ size = 14, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M2 2h12v12H2V2zm2 2v8h8V4H4zm3 1h2v2H7V5zm0 3h2v4H7V8z" />
    </svg>
  );
}

/** Pixelart icon: Chevron Down */
export function PixelChevronDown({ size = 12, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M2 4h2v2H2V4zm2 2h2v2H4V6zm2 0h2v2H6V6zm2-2h2v2H8V4z" />
    </svg>
  );
}

/** Pixelart icon: Chevron Up */
export function PixelChevronUp({ size = 12, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M4 6h2V4H4v2zm2 0h2V4H6v2zm2 2h2V6H8v2zm-6 0h2V6H2v2z" />
    </svg>
  );
}

/** Pixelart icon: Close (X) */
export function PixelClose({ size = 12, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="currentColor"
      shapeRendering="crispEdges"
      {...props}
    >
      <path d="M2 2h2v2H2V2zm6 0h2v2H8V2zm-2 2h2v2H6V4zm-2 2h2v2H4V6zm-2 2h2v2H2V8zm6 0h2v2H8V8z" />
    </svg>
  );
}
