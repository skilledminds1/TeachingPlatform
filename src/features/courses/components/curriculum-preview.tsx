type CurriculumModule = {
  id: string;
  title: string;
  lessons: Array<{ id: string; title: string }>;
};

export function CurriculumPreview({ modules }: { modules: CurriculumModule[] }) {
  const lessonCount = modules.reduce((sum, module) => sum + module.lessons.length, 0);

  if (modules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Curriculum details will appear here once the teacher adds modules and lessons.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {modules.length} module{modules.length === 1 ? "" : "s"} · {lessonCount} lesson
        {lessonCount === 1 ? "" : "s"}
      </p>
      <ol className="space-y-3">
        {modules.map((module, index) => (
          <li
            key={module.id}
            className="rounded-lg border border-border bg-background/50 px-4 py-3"
          >
            <p className="font-medium">
              <span className="text-muted-foreground">{index + 1}.</span> {module.title}
            </p>
            {module.lessons.length > 0 ? (
              <ul className="mt-2 space-y-1.5 border-l border-border pl-4">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id} className="text-sm text-muted-foreground">
                    {lesson.title}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No lessons yet</p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
