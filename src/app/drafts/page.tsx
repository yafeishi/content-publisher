import { redirect } from 'next/navigation';

export default function DraftsRedirectPage() {
  redirect('/content?status=draft,scheduled');
}
