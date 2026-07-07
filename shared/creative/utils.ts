export function splitHeadline(headline: string, rand: () => number): string[] {
  const words = headline.trim().split(/\s+/);
  if (words.length <= 1) return words;
  
  let parts = 2;
  if (words.length >= 5 && words.length <= 6) {
    parts = rand() < 0.5 ? 3 : 2;
  } else if (words.length > 6) {
    parts = 3;
  }

  if (parts === 2) {
    const mid = Math.round(words.length / 2);
    return [
      words.slice(0, mid).join(" "),
      words.slice(mid).join(" ")
    ];
  } else {
    const third1 = Math.round(words.length / 3);
    const third2 = Math.round((words.length * 2) / 3);
    return [
      words.slice(0, third1).join(" "),
      words.slice(third1, third2).join(" "),
      words.slice(third2).join(" ")
    ];
  }
}
