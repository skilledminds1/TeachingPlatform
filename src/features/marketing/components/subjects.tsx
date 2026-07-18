import {
  BookText,
  Calculator,
  Code2,
  FlaskConical,
  Languages,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";

const subjects = [
  { icon: Calculator, name: "Mathematics", href: "/teachers?subject=mathematics" },
  { icon: BookText, name: "English", href: "/teachers?subject=english" },
  { icon: FlaskConical, name: "Science", href: "/teachers?subject=science" },
  { icon: Languages, name: "Afrikaans", href: "/teachers?subject=afrikaans" },
  { icon: Code2, name: "Computer Science", href: "/teachers?subject=computer-science" },
  { icon: MoreHorizontal, name: "And more", href: "/teachers" },
] as const;

export function Subjects() {
  return (
    <section className="border-t border-border/60">
      <div className="mx-auto max-w-6xl space-y-10 px-6 py-16 md:px-8 md:py-20">
        <div className="space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Learn any subject</h2>
          <p className="text-muted-foreground">
            From school curriculum to professional skills — taught live by real teachers
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {subjects.map((subject) => (
            <li key={subject.name}>
              <Link
                href={subject.href}
                className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-6 text-center shadow-sm transition-colors duration-200 hover:border-primary/40 hover:bg-card/80"
              >
                <subject.icon className="size-6 text-primary" aria-hidden />
                <span className="text-sm font-medium">{subject.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
