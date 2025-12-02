export class Symbols {
  private static escapingSymbols: string[] | null = null;

  public static getEscapingSymbols(): string[] {
    if (this.escapingSymbols === null) {
      this.escapingSymbols = [
        ...Symbols.sigils.values(),
        ...Symbols.delimiters.values(),
        "\\",
        "\x00",
        "\t",
        "\n",
        "\r",
      ];
    }

    return this.escapingSymbols;
  }

  public static sigils: Set<string> = new Set([":", "$", "&", "#", "%"]);

  public static delimiters: Set<string> = new Set(["[", "]", "{", "}"]);
}
