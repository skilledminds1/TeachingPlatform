const faqs = [
  {
    question: "How do I pay for lessons?",
    answer:
      "You pay your teacher directly through their linked PayPal or PayFast account when you book. Amazing Skills never holds your money, and there's no platform fee added to lesson prices.",
  },
  {
    question: "Is it free for students?",
    answer:
      "Yes — browsing the marketplace, messaging teachers, and booking lessons is completely free for students. You only pay the teacher's advertised lesson rate.",
  },
  {
    question: "How are teachers verified?",
    answer:
      "Every teacher profile is manually reviewed before it appears on the marketplace. We check qualifications, profile completeness, and that a valid payment account is linked.",
  },
  {
    question: "What do teachers pay?",
    answer:
      "Teachers can start free, then unlock more tools from $9/month. Monthly and annual subscriptions use PayFast, and we take zero commission on lesson earnings.",
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
        <div className="grid gap-4 md:grid-cols-2 md:gap-6">
          {faqs.map((faq) => (
            <div
              key={faq.question}
              className="space-y-2 rounded-xl border border-border bg-card p-6 shadow-sm"
            >
              <h3 className="font-semibold">{faq.question}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
