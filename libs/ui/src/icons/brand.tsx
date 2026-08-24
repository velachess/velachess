/**
 * [UI/icons] Third-party marks used nominatively. Chess.com and Lichess
 * are CC0-1.0 from their brand pages; GitHub's mark follows its logo policy.
 * All inherit `currentColor` like interface icons.
 */
import type * as React from "react";

export type BrandIconProps = React.SVGProps<SVGSVGElement> & { title?: string };

function BrandIcon({
  title,
  children,
  ...props
}: BrandIconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function ChessComIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 0a3.85 3.85 0 0 0-3.875 3.846A3.84 3.84 0 0 0 9.73 6.969l-2.79 1.85c0 .622.144 1.114.434 1.649H9.83c-.014.245-.014.549-.014.925 0 .025.003.048.006.071-.064 1.353-.507 3.472-3.62 5.842-.816.625-1.423 1.495-1.806 2.533a.33.33 0 0 0-.045.084 8.124 8.124 0 0 0-.39 2.516c0 .1.216 1.561 8.038 1.561s8.038-1.46 8.038-1.561c0-2.227-.824-4.048-2.24-5.133-4.034-3.08-3.586-5.74-3.644-6.838h2.458c.29-.535.434-1.027.434-1.649l-2.79-1.836a3.86 3.86 0 0 0 1.604-3.123A3.873 3.873 0 0 0 13.445.275c-.004-.002-.01.004-.015.004A3.76 3.76 0 0 0 12 0Z" />
    </BrandIcon>
  );
}

export function LichessIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M10.457 6.161a.237.237 0 0 0-.296.165c-.8 2.785 2.819 5.579 5.214 7.428.653.504 1.216.939 1.591 1.292 1.745 1.642 2.564 2.851 2.733 3.178a.24.24 0 0 0 .275.122c.047-.013 4.726-1.3 3.934-4.574a.257.257 0 0 0-.023-.06L18.204 3.407 18.93.295a.24.24 0 0 0-.262-.293c-1.7.201-3.115.435-4.5 1.425-4.844-.323-8.718.9-11.213 3.539C.334 7.737-.246 11.515.085 14.128c.763 5.655 5.191 8.631 9.081 9.532.993.229 1.974.34 2.923.34 3.344 0 6.297-1.381 7.946-3.85a.24.24 0 0 0-.372-.3c-3.411 3.527-9.002 4.134-13.296 1.444-4.485-2.81-6.202-8.41-3.91-12.749C4.741 4.221 8.801 2.362 13.888 3.31c.056.01.115 0 .165-.029l.335-.197c.926-.546 1.961-1.157 2.873-1.279l-.694 1.993a.243.243 0 0 0 .02.202l6.082 10.192c-.193 2.028-1.706 2.506-2.226 2.611-.287-.645-.814-1.364-2.306-2.803-.422-.407-1.21-.941-2.124-1.56-2.364-1.601-5.937-4.02-5.391-5.984a.239.239 0 0 0-.165-.295z" />
    </BrandIcon>
  );
}

/**
 * The one mark here that does NOT inherit `currentColor`.
 *
 * Google's sign-in branding guidelines allow the "G" only in its four
 * official colours (or as a solid white/black variant on a matching
 * button); a tinted G is a modified logo. So the fills are literal, and
 * this component takes no colour from its surroundings.
 */
export function GoogleIcon({ title, ...props }: BrandIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <path
        fill="#4285F4"
        d="M23.52 12.273c0-.851-.076-1.669-.218-2.454H12v4.642h6.458a5.52 5.52 0 0 1-2.394 3.622v3.01h3.878c2.269-2.088 3.578-5.165 3.578-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.956-1.075 7.942-2.907l-3.878-3.01c-1.075.72-2.45 1.145-4.064 1.145-3.125 0-5.77-2.11-6.714-4.947H1.276v3.109A11.995 11.995 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.286 14.281A7.207 7.207 0 0 1 4.91 12c0-.791.136-1.56.376-2.281V6.61H1.276A11.995 11.995 0 0 0 0 12c0 1.936.464 3.769 1.276 5.39l4.01-3.109Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.773c1.762 0 3.344.605 4.588 1.794l3.442-3.442C17.951 1.19 15.235 0 12 0 7.31 0 3.255 2.69 1.276 6.609l4.01 3.11C6.23 6.882 8.875 4.772 12 4.772Z"
      />
    </svg>
  );
}

export function GitHubIcon(props: BrandIconProps) {
  return (
    <BrandIcon {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </BrandIcon>
  );
}
