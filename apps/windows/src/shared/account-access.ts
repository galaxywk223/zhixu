export interface AccountBindingState {
  userId: string;
  state: "initializing" | "bound";
}

export function canUseBoundWorkspace(
  authenticatedUserId: string | null,
  binding: AccountBindingState | null,
): boolean {
  return Boolean(
    authenticatedUserId &&
    binding?.state === "bound" &&
    binding.userId === authenticatedUserId,
  );
}
