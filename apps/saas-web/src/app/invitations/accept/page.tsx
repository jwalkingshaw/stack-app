import { Suspense } from 'react';
import InvitationAcceptClient from './InvitationAcceptClient';

export default function InvitationAcceptPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <InvitationAcceptClient />
    </Suspense>
  );
}
