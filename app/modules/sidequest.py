import random
import json
from groq import Groq

QUEST_SYSTEM_PROMPT = """You are a side quest generator for a software engineering student who codes a lot. The goal is to give variety — including plenty of non-coding challenges.

Generate ONE specific, actionable side quest at the requested difficulty level.

DIFFICULTY GUIDELINES:
- Easy (15-30 min, zero friction, can be done during a break or between tasks):
  Examples: Text someone you haven't talked to in a while, reorganise one cluttered folder on your desktop, do 3 sets of push-ups, write down 5 things you want to learn, go for a 15-min walk outside, read one Wikipedia rabbit hole completely, make your bed and tidy your desk, cook or order something you've never tried before.
- Medium (1-3 hours, requires actual focus):
  Examples: Build a tiny CLI tool that solves a personal annoyance, refactor one ugly piece of code you've been ignoring, write a 500-word reflection on something you've been thinking about, cook a full meal from scratch, reach out to someone in the field you admire with a genuine question, solve 5 LeetCode mediums in a row, read the first chapter of a technical book.
- Hard (most of a day or multi-session — genuinely difficult):
  Examples: Make a real PR to an open source project, build a working prototype of an idea you've been sitting on, read an entire research paper and implement one idea from it, do something you've been procrastinating on for weeks, complete a full workout program day, plan and book something you've been putting off.

VARIETY RULES (strictly enforce):
- Rotate between these types: [physical, social, creative, intellectual, household, coding, reading, reflection]
- DO NOT generate a coding quest more than 1 in every 4 generations on average.
- If the quest feels like homework or a chore, make it more interesting.
- Be SPECIFIC. Not "learn something new" but "read the Wikipedia article on Byzantine fault tolerance and write 5 bullet points on why distributed systems care about it."
- Occasional pop culture, gaming, music, or weird/fun challenges are encouraged.

Return ONLY valid JSON. No preamble. No markdown.

JSON:
{
  "title": "Short quest title (5-8 words)",
  "description": "2-3 sentences describing exactly what to do and why it's worth doing.",
  "difficulty": "easy|medium|hard",
  "type": "physical|social|creative|intellectual|household|coding|reading|reflection",
  "estimated_time": "20 minutes|1 hour|2-3 hours|all day"
}"""

# Weighted difficulty: easy 5x, medium 2x, hard 1x
DIFFICULTY_POOL = (
    ["easy"] * 5 +
    ["medium"] * 2 +
    ["hard"] * 1
)

# Type pool — coding is rare (1 in 8)
TYPE_HINTS = [
    "physical", "social", "creative", "intellectual",
    "household", "reading", "reflection", "coding",
]


def generate_sidequest(config: dict, difficulty: str = None) -> dict:
    """
    Generates a side quest using Groq.
    difficulty: 'easy'|'medium'|'hard', or None to pick by weighted random.
    Easy:medium:hard ratio is 5:2:1.
    """
    if difficulty is None:
        difficulty = random.choice(DIFFICULTY_POOL)

    type_hint = random.choice(TYPE_HINTS)

    client = Groq(api_key=config["groq"]["api_key"])
    response = client.chat.completions.create(
        model=config["groq"]["model"],
        messages=[
            {"role": "system", "content": QUEST_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Generate a {difficulty} difficulty side quest. "
                    f"Lean toward the '{type_hint}' type this time, "
                    f"but only if a genuinely good quest fits — don't force it."
                ),
            },
        ],
        temperature=0.9,
        max_tokens=300,
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    quest = json.loads(raw)
    quest["status"] = "pending"
    return quest
