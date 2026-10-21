import { Hammer } from 'lucide-react';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from './page-header';

/** P0 placeholder — each phase replaces its own page (see LOOP.md write sets) */
export function ComingSoon({ title, phase, subtitle }: { title: string; phase: string; subtitle?: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState icon={Hammer} message={`หน้านี้จะพร้อมใช้งานในเฟส ${phase}`} />
    </>
  );
}
