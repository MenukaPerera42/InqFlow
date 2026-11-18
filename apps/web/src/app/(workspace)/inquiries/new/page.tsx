import type { Metadata } from 'next';
import { NewInquiryForm } from '@/components/new-inquiry-form';

export const metadata: Metadata = { title: 'New inquiry' };
export default function NewInquiryPage() {
  return <NewInquiryForm />;
}
