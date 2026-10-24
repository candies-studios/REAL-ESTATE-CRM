import { PlannedModule } from '@/components/dashboard/planned-module';

export const metadata = { title: "Leads" };

export default function Page() {
  return (
    <PlannedModule
      title={"Leads"}
      phase={3}
      summary={"Every buyer, seller, landlord and tenant enquiry in one searchable table."}
      features={["Search by name, phone, property or locality", "Filters by stage, broker, source, score and date", "Lead detail with qualification answers, score explanation and activity timeline", "Duplicate detection and merge with audit trail", "Assignment, reassignment and restricted CSV export"]}
    />
  );
}
