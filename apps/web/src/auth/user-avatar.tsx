/** The signed-in person, as a picture. Initials are the normal case —
 * a password account has no `image`. */

import { Avatar, AvatarFallback, AvatarImage } from "@velachess/ui/components/avatar";

import type { SessionUser } from "./client.ts";

function initialsOf(user: Pick<SessionUser, "name" | "email">): string {
  const words = user.name.trim().split(/\s+/).filter(Boolean);
  const letters = [words[0], words.length > 1 ? words.at(-1) : undefined]
    .filter((word): word is string => Boolean(word))
    .map((word) => [...word][0]!)
    .join("");

  return (letters || [...user.email][0] || "").toUpperCase();
}

export function UserAvatar({
  user,
  size = "default",
  className,
}: {
  user: Pick<SessionUser, "name" | "email" | "image">;
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} {...(className ? { className } : {})}>
      {user.image ? (
        <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <AvatarFallback>{initialsOf(user)}</AvatarFallback>
    </Avatar>
  );
}
