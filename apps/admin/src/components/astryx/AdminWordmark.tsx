import React from "react";

/** The [admin] wordmark. The brackets carry the workspace accent; the word
 * is the ink colour. Rendered in the sidebar, the phone top bar, sign in and
 * sign out. As a link it goes home to the overview. */
export function AdminWordmark({
  href,
  label = "Admin",
  onClick,
  className,
}: {
  href?: string;
  label?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}) {
  const classes = className
    ? `admin-bracket-wordmark ${className}`
    : "admin-bracket-wordmark";
  const letters = (
    <>
      <span aria-hidden="true">[</span>admin
      <span aria-hidden="true">]</span>
    </>
  );
  return href ? (
    <a className={classes} href={href} aria-label={label} onClick={onClick}>
      {letters}
    </a>
  ) : (
    <span className={classes} aria-label={label}>
      {letters}
    </span>
  );
}
