// Activity is open to every signed-in role. Admin/Manager see the full feed;
// Employee sees only their own customer logs and follow-ups (filtered inside
// the CustomerLogs and FollowUpList components).
export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
