import { PageShell } from '@/components/page-shell';
import { NewApplicantForm } from './new-applicant-form';
import { todayIso } from '@/core/dates';

export default function NewApplicantPage() {
  return (
    <PageShell
      breadcrumb="Sentinel · Recruitment · New applicant"
      title="New applicant"
      description="Log someone who has applied. They start at 'Applied' — you'll record their clearances and advance them through screening, then Hire turns them into an employee."
      footerHint="Required fields are marked. You can fill in contact and address details now or later on the applicant's page."
    >
      <div className="card">
        <NewApplicantForm today={todayIso()} />
      </div>
    </PageShell>
  );
}
