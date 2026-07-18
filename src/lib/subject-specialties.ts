/**
 * Optional specialty topics keyed by subject slug.
 * Teachers can pick these to clarify what they teach within a subject.
 */
export const SUBJECT_SPECIALTIES: Record<string, readonly string[]> = {
  technology: [
    "Web Development",
    "Mobile Apps",
    "Python",
    "JavaScript / TypeScript",
    "Java",
    "C# / .NET",
    "Cybersecurity",
    "Networking",
    "Cloud Computing",
    "DevOps",
    "Data Science",
    "AI / Machine Learning",
    "Robotics",
    "CAD / 3D Design",
    "Game Development",
    "IT Support",
  ],
  "computer-science": [
    "Programming Fundamentals",
    "Algorithms & Data Structures",
    "Databases",
    "Software Engineering",
    "Web Development",
    "Mobile Development",
    "Operating Systems",
    "Computer Networks",
    "AI / Machine Learning",
    "Cybersecurity",
  ],
  mathematics: [
    "Arithmetic",
    "Algebra",
    "Geometry",
    "Trigonometry",
    "Calculus",
    "Statistics",
    "Financial Maths",
    "Exam Prep",
    "University Maths",
  ],
  science: [
    "General Science",
    "Earth Science",
    "Environmental Science",
    "Exam Prep",
  ],
  "physical-sciences": [
    "Physics",
    "Chemistry",
    "Exam Prep",
  ],
  "life-sciences": [
    "Biology",
    "Anatomy",
    "Ecology",
    "Exam Prep",
  ],
  biology: ["Cell Biology", "Genetics", "Human Biology", "Ecology", "Exam Prep"],
  chemistry: ["Organic Chemistry", "Inorganic Chemistry", "Physical Chemistry", "Exam Prep"],
  physics: ["Mechanics", "Electricity & Magnetism", "Waves & Optics", "Modern Physics", "Exam Prep"],
  english: [
    "Grammar",
    "Literature",
    "Creative Writing",
    "Academic Writing",
    "ESL / EFL",
    "Speaking & Pronunciation",
    "Exam Prep",
  ],
  afrikaans: ["Grammar", "Literature", "Conversation", "Exam Prep"],
  french: ["Beginner", "Intermediate", "Advanced", "Conversation", "Exam Prep"],
  spanish: ["Beginner", "Intermediate", "Advanced", "Conversation", "Exam Prep"],
  german: ["Beginner", "Intermediate", "Advanced", "Conversation", "Exam Prep"],
  portuguese: ["Beginner", "Intermediate", "Advanced", "Conversation", "Exam Prep"],
  italian: ["Beginner", "Intermediate", "Advanced", "Conversation", "Exam Prep"],
  "chinese-mandarin": ["Beginner", "Intermediate", "Advanced", "Conversation", "HSK Prep"],
  arabic: ["Beginner", "Intermediate", "Advanced", "Conversation", "Exam Prep"],
  japanese: ["Beginner", "Intermediate", "Advanced", "Conversation", "JLPT Prep"],
  korean: ["Beginner", "Intermediate", "Advanced", "Conversation", "TOPIK Prep"],
  music: [
    "Piano",
    "Guitar",
    "Violin",
    "Drums",
    "Voice / Singing",
    "Music Theory",
    "Songwriting",
    "Production",
  ],
  art: ["Drawing", "Painting", "Digital Art", "Sculpture", "Design", "Art History"],
  accounting: ["Financial Accounting", "Management Accounting", "Tax", "Exam Prep"],
  economics: ["Microeconomics", "Macroeconomics", "Exam Prep"],
  "business-studies": ["Entrepreneurship", "Management", "Marketing", "Exam Prep"],
  history: ["World History", "African History", "Exam Prep"],
  geography: ["Physical Geography", "Human Geography", "Exam Prep"],
  psychology: ["Introduction", "Developmental", "Social Psychology", "Exam Prep"],
  statistics: ["Descriptive Statistics", "Inferential Statistics", "Exam Prep"],
  "ielts-toefl": ["IELTS Academic", "IELTS General", "TOEFL iBT", "Speaking Practice", "Writing Practice"],
  drama: ["Acting", "Public Speaking", "Theatre Studies"],
} as const;

export function getSubjectSpecialties(slug: string): readonly string[] {
  return SUBJECT_SPECIALTIES[slug] ?? [];
}

export function subjectHasSpecialties(slug: string): boolean {
  return getSubjectSpecialties(slug).length > 0;
}
