import ContactPopover from "@/components/ContactPopover";
import type { FollowUpStatus } from "@/api/follow-ups";

interface Props {
  candidateId: number;
  candidateName?: string;
  phone?: string | null;
  email?: string | null;
  wechat?: string | null;
  /** Pre-known status from the list payload, kept for API compatibility (currently unused). */
  initialStatus?: FollowUpStatus | null;
  /** Refresh parent list/grid after an action that may change list-visible fields. */
  onChanged?: () => void;
}

export default function CandidateRowActions({
  candidateId,
  candidateName,
  phone = null,
  email = null,
  wechat = null,
  onChanged,
}: Props) {
  return (
    <ContactPopover
      candidateId={candidateId}
      candidateName={candidateName}
      phone={phone}
      email={email}
      wechat={wechat}
      onLogged={onChanged}
    />
  );
}
