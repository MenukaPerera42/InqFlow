import Image from 'next/image';
import Link from 'next/link';

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      aria-label="InqFlow home"
      className="inline-flex items-center"
    >
      <Image
        src={
          compact
            ? '/brand/inqflow-mark-256.png'
            : '/brand/inqflow-logo-640.png'
        }
        alt="InqFlow"
        width={compact ? 30 : 160}
        height={compact ? 33 : 40}
        priority
        style={{ width: compact ? 30 : 160, height: 'auto' }}
      />
    </Link>
  );
}
