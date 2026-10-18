// Quick reference for the Regular Expressions course. Every example is runnable
// on the local JVM through java.util.regex (click Run).

export const REGEX_CHEATSHEET = [
  {
    group: "Applying a pattern",
    items: [
      { name: "re-find", desc: "First match anywhere (or nil).", example: "(re-find #\"\\d+\" \"a12b\")" },
      { name: "re-seq", desc: "Lazy seq of ALL matches.", example: "(re-seq #\"\\d+\" \"a1 b22\")" },
      { name: "re-matches", desc: "Match the WHOLE string (or nil).", example: "(re-matches #\"\\d+\" \"123\")" },
      { name: "re-pattern", desc: "Build a pattern from a string.", example: "(re-find (re-pattern \"\\\\d+\") \"a9\")" },
      { name: "re-matcher", desc: "Walk matches yourself with .find and .group.", example: "(let [m (re-matcher #\"\\d+\" \"a1 b22\")] (.find m) (.group m))" },
    ],
  },
  {
    group: "Character classes",
    items: [
      { name: ".", desc: "Any character (except newline).", example: "(re-seq #\"h.t\" \"hat hot\")" },
      { name: "[abc]", desc: "Any one of a, b, c.", example: "(re-seq #\"[aeiou]\" \"regex\")" },
      { name: "[a-z]", desc: "A range of characters.", example: "(re-seq #\"[a-z]+\" \"Hi There\")" },
      { name: "[^…]", desc: "NOT any of these.", example: "(re-seq #\"[^0-9 ]+\" \"a1 b2\")" },
      { name: "\\d \\w \\s", desc: "Digit, word char, whitespace.", example: "(re-seq #\"\\w+\" \"hi_there!\")" },
    ],
  },
  {
    group: "Anchors",
    items: [
      { name: "^", desc: "Start of the string.", example: "(re-find #\"^cat\" \"cat food\")" },
      { name: "$", desc: "End of the string.", example: "(re-find #\".*\\.txt$\" \"a.txt\")" },
      { name: "\\b", desc: "Word boundary.", example: "(re-seq #\"\\bcat\\b\" \"cat catty\")" },
    ],
  },
  {
    group: "Quantifiers",
    items: [
      { name: "*", desc: "Zero or more.", example: "(re-find #\"ab*c\" \"ac\")" },
      { name: "+", desc: "One or more.", example: "(re-find #\"ab+c\" \"abbc\")" },
      { name: "?", desc: "Optional (zero or one).", example: "(re-find #\"colou?r\" \"color\")" },
      { name: "{n,m}", desc: "Between n and m times.", example: "(re-find #\"\\d{2,4}\" \"1234567\")" },
      { name: "+? *?", desc: "Lazy: match as little as possible.", example: "(re-find #\"<.+?>\" \"<a><b>\")" },
    ],
  },
  {
    group: "Groups & alternation",
    items: [
      { name: "( )", desc: "Capturing group.", example: "(re-find #\"(\\d+)-(\\d+)\" \"12-34\")" },
      { name: "(?:…)", desc: "Group without capturing.", example: "(re-find #\"(?:Mr|Dr)\\. (\\w+)\" \"Dr. Who\")" },
      { name: "|", desc: "Alternation (this OR that).", example: "(re-seq #\"cat|dog\" \"cat dog\")" },
    ],
  },
  {
    group: "Transforming text",
    items: [
      { name: "str/replace", desc: "Rewrite every match.", example: "(str/replace \"a1b2\" #\"\\d\" \"*\")" },
      { name: "$1 $2", desc: "Reference captures in the replacement.", example: "(str/replace \"12-34\" #\"(\\d+)-(\\d+)\" \"$2-$1\")" },
      { name: "replace + fn", desc: "Compute each replacement.", example: "(str/replace \"a1\" #\"\\d\" (fn [d] (str \"[\" d \"]\")))" },
      { name: "str/split", desc: "Split on a pattern.", example: "(str/split \"a,,b\" #\",\")" },
      { name: "str/replace-first", desc: "Rewrite only the FIRST match.", example: "(str/replace-first \"Banana\" #\"a\" \"o\")" },
      { name: "re-seq + parse-long", desc: "Extract numbers as real integers.", example: "(map parse-long (re-seq #\"\\d+\" \"3 apples, 14 pens\"))" },
    ],
  },
  {
    group: "Advanced patterns",
    items: [
      { name: "flags (i)", desc: "Case-insensitive: put (?i) at the start.", example: "(re-find #\"(?i)cat\" \"The CAT\")" },
      { name: "flags (m s)", desc: "(?m): ^/$ match each line · (?s): . matches newlines.", example: ";; Flags go inside the pattern, and combine: (?im) is both.\n(re-find #\"(?m)^b\" \"alpha\\nbeta\")" },
      { name: "Pattern/compile", desc: "Build a pattern with flag constants.", example: "(re-find (java.util.regex.Pattern/compile \"cat\" java.util.regex.Pattern/CASE_INSENSITIVE) \"The CAT\")" },
      { name: "(?=…)", desc: "Positive lookahead (followed by).", example: "(re-find #\"\\d+(?=kg)\" \"100kg\")" },
      { name: "(?!…)", desc: "Negative lookahead (not followed by).", example: "(re-find #\"cat(?!\\d)\" \"cat1 caterpillar\")" },
      { name: "(?<=…)", desc: "Positive lookbehind (preceded by).", example: "(re-find #\"(?<=\\$)\\d+\" \"$42\")" },
      { name: "(?<!…)", desc: "Negative lookbehind (not preceded by).", example: "(re-seq #\"(?<!\\$)\\b\\d+\" \"$5 and 7 and $9 and 12\")" },
      { name: "(?<name>…)", desc: "Named capturing group.", example: "(re-find #\"(?<y>\\d{4})\" \"2026\")" },
      { name: "${name}", desc: "Use a named group in a replacement (braces).", example: "(str/replace \"2026\" #\"(?<y>\\d{4})\" \"[${y}]\")" },
      { name: "\\1", desc: "Backreference to group 1.", example: "(re-find #\"(.)\\1\" \"book\")" },
    ],
  },
];
