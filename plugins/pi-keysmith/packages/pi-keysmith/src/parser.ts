export interface ParsedKeyToken {
  notation: string;
  input: string;
}

export interface ParseKeySequenceOptions {
  allowLeaderPrefix?: boolean;
}

const ANGLE_KEYS: Record<string, string> = {
  "ctrl+x": "\u0018",
  "c-x": "\u0018",
  space: " ",
  tab: "\t",
  cr: "\r",
  esc: "\u001b",
};

export function parseKeySequence(source: string, options: ParseKeySequenceOptions = {}): ParsedKeyToken[] {
  const tokens: ParsedKeyToken[] = [];
  let index = 0;

  while (index < source.length) {
    if (source[index] !== "<") {
      tokens.push({ notation: source[index], input: source[index] });
      index += 1;
      continue;
    }

    const closeIndex = source.indexOf(">", index + 1);
    if (closeIndex === -1) throw new Error(`Unterminated key token in ${source}`);

    const notation = source.slice(index, closeIndex + 1).toLowerCase();
    const name = notation.slice(1, -1);
    if (name === "leader") {
      if (!options.allowLeaderPrefix || tokens.length > 0 || index !== 0) {
        throw new Error("<leader> is only supported as a leading binding prefix");
      }
      index = closeIndex + 1;
      continue;
    }

    const input = ANGLE_KEYS[name];
    if (input === undefined) throw new Error(`Unsupported key token ${notation}`);
    tokens.push({ notation, input });
    index = closeIndex + 1;
  }

  return tokens;
}
