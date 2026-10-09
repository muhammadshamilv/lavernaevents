// Plan quotas that are nullable on the backend (total_invitations,
// template_limit, voice_call_limit) mean "unlimited" when null and
// "none included" when 0. Both public plan views share this wording.

export function countLabel(value: number | null, singular: string, plural = `${singular}s`): string {
    if (value === null) return `Unlimited ${plural}`;
    return `${value.toLocaleString("en-IN")} ${value === 1 ? singular : plural}`;
  }
  
  export function includedLabel(value: number | null, singular: string, plural = `${singular}s`): string {
    if (value === 0) return `No ${plural} included`;
    return countLabel(value, singular, plural);
  }