import { Suspense } from 'react';
import { InquiryDetail } from '@/components/inquiry-detail';
import { LoadingState } from '@/components/loading-state';

export default function InquiryPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading inquiry…" />}>
      <InquiryDetail />
    </Suspense>
  );
}
