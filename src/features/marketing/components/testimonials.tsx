import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "I went from 4 private students to a fully booked week in two months. Getting paid straight into my own account is the best part.",
    name: "Thandi M.",
    role: "Mathematics tutor, Johannesburg",
  },
  {
    quote:
      "Booking a lesson takes less time than ordering food. My daughter's marks in Science improved a full symbol this term.",
    name: "Pieter v.d. Berg",
    role: "Parent, Stellenbosch",
  },
  {
    quote:
      "We moved our whole academy over — nine tutors, one dashboard. Scheduling headaches are gone.",
    name: "Naledi K.",
    role: "Academy owner, Cape Town",
  },
] as const;

export function Testimonials() {
  return (
    <section className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-6xl space-y-12 px-6 py-16 md:px-8 md:py-24">
        <div className="space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Loved by teachers and students</h2>
          <p className="text-muted-foreground">Real stories from the community</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <figure
              key={testimonial.name}
              className="flex flex-col justify-between space-y-6 rounded-xl border border-border bg-card p-8 shadow-sm"
            >
              <div className="space-y-4">
                <div className="flex gap-1" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-primary text-primary" aria-hidden />
                  ))}
                </div>
                <blockquote className="text-sm leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </blockquote>
              </div>
              <figcaption>
                <p className="text-sm font-semibold">{testimonial.name}</p>
                <p className="text-xs text-muted-foreground">{testimonial.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
