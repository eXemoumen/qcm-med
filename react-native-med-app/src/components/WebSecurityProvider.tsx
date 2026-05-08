import React from "react";

/**
 * WebSecurityProvider - Passthrough wrapper.
 * The blur/overlay protection has been removed to eliminate the
 * "Protection Active" screen that blocked the UI on every tab switch.
 */
export function WebSecurityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
