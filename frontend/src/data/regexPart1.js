// Regular Expressions course — Part 1: Getting Started + Building Blocks.
// Regexes are taught through Clojure's regex tools, which run live via SCI.
// Pattern literals are written as #"..." and evaluate to a JS RegExp under the hood.
// Block types: p | h | note | list | code (runnable) | read (static).

export const regexPart1 = [
  {
    id: "what-is-regex",
    title: "What Is a Regular Expression?",
    group: "Getting Started",
    summary: "Tiny patterns that find text inside text.",
    content: [
      { t: "p", text: "A regular expression (regex) is a small pattern that describes a set of strings. You use it to search, match, extract, validate and transform text. Once you know a little regex, tasks that felt impossible become one-liners." },
      { t: "p", text: "In this course you'll run every example live. We use Clojure's regex tools because they run right here in your browser. A pattern is written between #\" and \" — for example #\"cat\" is the pattern that matches the letters c-a-t." },
      { t: "h", text: "Your first match" },
      { t: "p", text: "The function re-find looks for the FIRST place a pattern matches inside a string, and returns the matched text (or nil if there's no match). Press Run, then try changing the word." },
      { t: "code", code: "(re-find #\"cat\" \"the cat sat on the mat\")" },
      { t: "p", text: "When the pattern isn't found anywhere, re-find returns nil ('nothing')." },
      { t: "code", code: "(re-find #\"dog\" \"the cat sat on the mat\")" },
      { t: "note", text: "Read #\"cat\" as 'the pattern cat'. Everything you learn is about writing cleverer patterns than plain literal words." },
    ],
    exercises: [
      {
        prompt: "Use re-find to find the word \"sat\" inside \"the cat sat\". The result should be \"sat\".",
        starter: "(re-find #\"\" \"the cat sat\")",
        tests: ["(= answer \"sat\")"],
        solution: "(re-find #\"sat\" \"the cat sat\")",
        hint: "Put sat between the #\" and \": #\"sat\".",
      },
      {
        prompt: "Matching is case-sensitive by default. Use re-find to search for \"Cat\" (capital C) in \"the cat sat\" — the answer should be nil, because the string has a lowercase 'cat'.",
        starter: "(re-find #\"\" \"the cat sat\")",
        tests: ["(nil? answer)"],
        solution: "(re-find #\"Cat\" \"the cat sat\")",
        hint: "The pattern #\"Cat\" won't match the lowercase 'cat', so re-find returns nil.",
      },
    ],
  },

  {
    id: "find-seq-matches",
    title: "find, seq & matches",
    group: "Getting Started",
    summary: "The three core ways to apply a pattern.",
    content: [
      { t: "p", text: "There are three functions you'll reach for constantly. They differ in WHERE and HOW MUCH they match." },
      { t: "h", text: "re-find — the first match" },
      { t: "p", text: "re-find returns the first matching piece anywhere in the string." },
      { t: "code", code: "(re-find #\"\\d+\" \"order 66 shipped 99 items\")" },
      { t: "p", text: "Here \\d means 'a digit' and + means 'one or more' (more on these soon). So \\d+ matches a run of digits — and re-find returns the FIRST run, \"66\"." },
      { t: "h", text: "re-seq — every match" },
      { t: "p", text: "re-seq returns a lazy sequence of ALL non-overlapping matches. Perfect for extracting every occurrence." },
      { t: "code", code: "(re-seq #\"\\d+\" \"order 66 shipped 99 items\")" },
      { t: "h", text: "re-matches — the WHOLE string" },
      { t: "p", text: "re-matches only succeeds if the pattern matches the ENTIRE string from start to finish. It's the tool for validation ('is this string exactly a number?')." },
      { t: "code", code: "(re-matches #\"\\d+\" \"12345\")" },
      { t: "code", code: "(re-matches #\"\\d+\" \"12a45\")" },
      { t: "note", text: "Remember the difference: re-find = 'is it in there?', re-seq = 'give me all of them', re-matches = 'is the whole string exactly this?'." },
    ],
    exercises: [
      {
        prompt: "Use re-seq to collect every run of digits in \"a12b345c\". Expected: (\"12\" \"345\").",
        starter: "(re-seq #\"\" \"a12b345c\")",
        tests: ["(= answer '(\"12\" \"345\"))"],
        solution: "(re-seq #\"\\d+\" \"a12b345c\")",
        hint: "The pattern for one-or-more digits is #\"\\d+\".",
      },
      {
        prompt: "Use re-matches to check that \"2026\" is entirely digits (it should return the string \"2026\").",
        starter: "(re-matches #\"\" \"2026\")",
        tests: ["(= answer \"2026\")"],
        solution: "(re-matches #\"\\d+\" \"2026\")",
        hint: "re-matches needs the whole string to match: #\"\\d+\".",
      },
    ],
  },

  {
    id: "literals-and-dot",
    title: "Literal Text, the Dot & Escaping",
    group: "Building Blocks",
    summary: "Match exact characters — and the special 'any character'.",
    content: [
      { t: "p", text: "Most characters in a pattern match themselves: b matches b, 7 matches 7. Matching is case-sensitive by default, so #\"Cat\" does not match \"cat\"." },
      { t: "code", code: "(re-find #\"Cat\" \"the cat sat\")" },
      { t: "h", text: "The dot: any character" },
      { t: "p", text: "The dot . is special — it matches ANY single character (except a newline). So h.t matches hat, hot, hit, h9t…" },
      { t: "code", code: "(re-seq #\"h.t\" \"hat hot hit h9t\")" },
      { t: "h", text: "Escaping special characters" },
      { t: "p", text: "To match a literal dot (not 'any character'), escape it with a backslash: \\. Escaping turns a special character back into an ordinary one." },
      { t: "code", code: "(re-find #\"3\\.14\" \"pi is about 3.14 today\")" },
      { t: "p", text: "Without the backslash, the dot would match any character — so #\"3.14\" would also match \"3x14\". Try it:" },
      { t: "code", code: "(re-find #\"3.14\" \"the code 3x14 is odd\")" },
      { t: "note", text: "Characters that need escaping to be taken literally include . * + ? ( ) [ ] { } ^ $ | and \\ itself." },
    ],
    exercises: [
      {
        prompt: "Match the exact price \"$5.00\" inside \"it costs $5.00 today\". (Escape the $ and the dot.) Result: \"$5.00\".",
        starter: "(re-find #\"\" \"it costs $5.00 today\")",
        tests: ["(= answer \"$5.00\")"],
        solution: "(re-find #\"\\$5\\.00\" \"it costs $5.00 today\")",
        hint: "Escape both special characters: #\"\\$5\\.00\".",
      },
      {
        prompt: "The dot matches ANY single character. Define a pattern (answer) that matches \"hat\", \"hot\" and \"hut\" — any character between h and t. It should NOT match \"ht\" (needs three characters) or \"halt\".",
        starter: "#\"\"",
        tests: ["(boolean (re-find answer \"hat\"))", "(boolean (re-find answer \"hut\"))", "(nil? (re-find answer \"halt\"))", "(nil? (re-find answer \"ht\"))"],
        solution: "#\"h.t\"",
        hint: "h, the dot, then t: #\"h.t\".",
      },
    ],
  },

  {
    id: "character-classes",
    title: "Character Classes",
    group: "Building Blocks",
    summary: "Match one of a set of characters.",
    content: [
      { t: "p", text: "Square brackets define a character class — a set from which any ONE character may match. [aeiou] matches a single vowel." },
      { t: "code", code: "(re-seq #\"[aeiou]\" \"regular expressions\")" },
      { t: "h", text: "Ranges" },
      { t: "p", text: "Use a hyphen for a range: [a-z] is any lowercase letter, [0-9] any digit, [A-Za-z0-9] any letter or digit." },
      { t: "code", code: "(re-seq #\"[a-z]+\" \"Hello World 42\")" },
      { t: "h", text: "Negation" },
      { t: "p", text: "A ^ at the START of a class negates it: [^0-9] means 'any character that is NOT a digit'." },
      { t: "code", code: "(re-seq #\"[^0-9 ]+\" \"ab 12 cd 34\")" },
      { t: "h", text: "Shorthand classes" },
      { t: "p", text: "Common classes have shortcuts: \\d = digit, \\w = word character (letters, digits, underscore), \\s = whitespace. Their uppercase versions mean the opposite: \\D non-digit, \\W non-word, \\S non-whitespace." },
      { t: "code", code: "(re-seq #\"\\w+\" \"hi_there, world! 99\")" },
      { t: "note", text: "So \\d is really just a handy nickname for [0-9], and \\w for [A-Za-z0-9_]." },
    ],
    exercises: [
      {
        prompt: "Use re-seq to pull out every run of letters (upper or lower case) from \"Cat9 Dog8\". Expected: (\"Cat\" \"Dog\").",
        starter: "(re-seq #\"\" \"Cat9 Dog8\")",
        tests: ["(= answer '(\"Cat\" \"Dog\"))"],
        solution: "(re-seq #\"[A-Za-z]+\" \"Cat9 Dog8\")",
        hint: "A class for any letter is [A-Za-z]; add + for one-or-more.",
      },
      {
        prompt: "A ^ at the start of a class negates it. Define a pattern (answer) that matches one or more NON-digit characters. It should match \"abc\" and \"a-b\" but not \"12\".",
        starter: "#\"\"",
        tests: ["(boolean (re-matches answer \"abc\"))", "(boolean (re-matches answer \"a-b\"))", "(nil? (re-matches answer \"12\"))"],
        solution: "#\"[^0-9]+\"",
        hint: "Negate the digit class and add +: #\"[^0-9]+\".",
      },
    ],
  },

  {
    id: "anchors",
    title: "Anchors & Word Boundaries",
    group: "Building Blocks",
    summary: "Say WHERE a match must occur.",
    content: [
      { t: "p", text: "Anchors don't match characters — they match POSITIONS. ^ means 'start of the string' and $ means 'end of the string'." },
      { t: "code", code: "(re-find #\"^cat\" \"cat food\")" },
      { t: "code", code: "(re-find #\"^cat\" \"the cat\")" },
      { t: "p", text: "Combine ^ and $ to insist the whole string matches — a common validation trick (re-matches does this implicitly)." },
      { t: "code", code: "(re-find #\".*\\.txt$\" \"notes.txt\")" },
      { t: "h", text: "Word boundaries" },
      { t: "p", text: "\\b matches a word boundary — the edge between a word character and a non-word character. It lets you match whole words. Notice how \"category\" is skipped below." },
      { t: "code", code: "(re-seq #\"\\bcat\\b\" \"cat category the cat\")" },
      { t: "note", text: "Anchors are invisible: they consume no characters. ^ and $ pin a match to the ends; \\b pins it to word edges." },
    ],
    exercises: [
      {
        prompt: "Define a pattern (as answer) that matches a string made ONLY of digits from start to end. It should match \"12345\" but not \"12a45\" nor \"123 \".",
        starter: ";; define the pattern as the last value\n#\"\"",
        tests: ["(boolean (re-matches answer \"12345\"))", "(nil? (re-matches answer \"12a45\"))", "(nil? (re-matches answer \"123 \"))"],
        solution: "#\"\\d+\"",
        hint: "re-matches already anchors to the whole string, so #\"\\d+\" is enough.",
      },
      {
        prompt: "\\b marks a word boundary. Define a pattern (answer) that matches \"cat\" only as a WHOLE word — it should match in \"the cat\" but not in \"catalogue\" or \"concatenate\".",
        starter: "#\"\"",
        tests: ["(boolean (re-find answer \"the cat\"))", "(nil? (re-find answer \"catalogue\"))", "(nil? (re-find answer \"concatenate\"))"],
        solution: "#\"\\bcat\\b\"",
        hint: "Bound the word with \\b on both sides: #\"\\bcat\\b\".",
      },
    ],
  },
];
