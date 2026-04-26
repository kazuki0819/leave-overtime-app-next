import { Suspense } from "react";
import GrantCycleReview from "@/components/pages/grant-cycle-review";

export default function Page() {
  return (
    <Suspense fallback={<div className="container mx-auto p-4">読み込み中...</div>}>
      <GrantCycleReview />
    </Suspense>
  );
}
