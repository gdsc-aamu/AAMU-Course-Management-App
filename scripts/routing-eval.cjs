const cases = [
  { question: "How many credits do I have left for BSCS?", expected: "DB_ONLY" },
  { question: "What is the academic dismissal policy?", expected: "RAG_ONLY" },
  { question: "Given my GPA is 1.95, am I at risk of dismissal?", expected: "HYBRID" },
  { question: "When is the registration deadline?", expected: "RAG_ONLY" },
  { question: "What classes do I still need next semester?", expected: "DB_ONLY" },
]

console.log("Routing eval starter set")
for (const c of cases) {
  console.log(`- ${c.expected}: ${c.question}`)
}
console.log("\nUse these with POST /api/chat/query to validate route quality.")
