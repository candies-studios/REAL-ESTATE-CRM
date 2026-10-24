import { PlannedModule } from '@/components/dashboard/planned-module';

export const metadata = { title: "Tasks" };

export default function Page() {
  return (
    <PlannedModule
      title={"Tasks"}
      phase={5}
      summary={"Follow-ups and reminders, so nothing is missed."}
      features={["Automatic first-contact and follow-up tasks", "Overdue flags and escalation by admin settings", "Snooze, reassign and complete with history", "Email and WhatsApp reminders once credentials are configured"]}
    />
  );
}
