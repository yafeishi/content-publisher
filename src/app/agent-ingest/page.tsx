import { redirect } from 'next/navigation';

export default function LegacyAgentIngestPage() {
  redirect('/agent-submit');
}
