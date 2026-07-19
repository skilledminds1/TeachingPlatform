const faqs = [
  {
    question: "How do I pay for lessons?",
    answer:
      "You pay your teacher directly through their linked PayPal account when you book. Amazing Skills never holds your money, and there's no platform fee added to lesson prices.",
  },
  {
    question: "Is it free for students?",
    answer:
      "Yes — browsing courses and tutors, messaging teachers, and booking lessons is completely free for students. You only pay the teacher's advertised lesson or course rate.",
  },
  {
    question: "How are teachers verified?",
    answer:
      "Every teacher profile is manually reviewed before it appears on Find Tutor. We check qualifications, profile completeness, and that a valid payment account is linked.",
  },
  {
    question: "What do teachers pay?",
    answer:
      "Teachers can start free for live tutoring. Course creation and sales require Professional or Business, with zero commission on lesson and course earnings. Subscriptions use PayFast.",
  },
  {
    question: "What happens if a lesson is cancelled?",
    answer:
      "Each teacher sets a cancellation policy. Cancel more than 24 hours ahead for a full refund per the teacher's policy; refunds are processed through the teacher's payment provider.",
  },
  {
    question: "Do I need to install anything for video lessons?",
    answer:
      "No. Lessons run in your browser on any device — laptop, tablet, or phone. You'll get a join link on your dashboard and by email before each session.",
  },
] as const;

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border/60">
      <div className="mx-auto max-w-4xl space-y-12 px-6 py-16 md:px-8 md:py-24">
        <div className="space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h2>
          <p className="text-muted-foreground">
            Everything you need to know before your first lesson
          </p>
        </div>
        <ul className="space-y-6">
          {faqs.map((faq) => (
            <li key={faq.question} className="space-y-2 border-b border-border/60 pb-6 last:border-0">
              <h3 className="text-lg font-semibold">{faq.question}</h3>
              <p className="text-muted-foreground">{faq.answer}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
