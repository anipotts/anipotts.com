/** Experience dates/grouping describe tenure; project status describes lifecycle. */
export function workStatusLabel({
  kind,
  status,
  catalogGroup,
}: {
  kind?: string;
  status: string;
  catalogGroup?: string;
}): string | undefined {
  if (kind === "experience") {
    return catalogGroup === "past" ? "past experience" : undefined;
  }
  return status === "wip" ? "in progress" : status;
}
