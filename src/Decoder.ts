import { Symbols } from "./Symbols";

export class Decoder {
  private source: string = "";

  private index: number = 0;

  private dictionaryMap: Map<string, any> = new Map();

  /*

  valid inputs are:

  dictionary\x00content
  &hello\x00[$0$0]

  content
  [&hello&world]

  */

  public decode(source: string): any {
    this.source = source;

    while (!this.isSeparator() && !this.isEnded()) {
      const value = this.decodeToken();

      const placeholder = `$${this.dictionaryMap.size}`;

      this.dictionaryMap.set(placeholder, value);
    }

    // content only

    if (!this.isSeparator()) {
      if (this.dictionaryMap.size !== 1) {
        throw new Error("Bad input.");
      }

      return this.dictionaryMap.get("$0")!;
    }

    this.index++;

    if (this.isEnded()) {
      throw new Error("Bad input.");
    }

    const value = this.decodeToken();

    if (!this.isEnded()) {
      throw new Error("Bad input.");
    }

    return value;
  }

  private decodeToken(): any {
    switch (this.char()) {
      case "$": {
        return this.decodePlaceholder();

        break;
      }

      case ":": {
        return this.decodeConstant();

        break;
      }

      case "&": {
        return this.decodeString();

        break;
      }

      case "#": {
        return this.decodeNumber();

        break;
      }

      case "%": {
        return this.decodeBigInt();

        break;
      }

      case "[": {
        return this.decodeArray();

        break;
      }

      case "{": {
        return this.decodeObject();

        break;
      }

      default: {
        throw new Error(`Unexpected character "${this.char()}".`);

        break;
      }
    }
  }

  private decodePlaceholder(): any {
    this.index++;

    let key = "";

    while (this.isToken()) {
      key += this.char();

      this.index++;
    }

    const placeholder = `$${key}`;

    if (!this.dictionaryMap.has(placeholder)) {
      throw new Error(`Unknown value: "$${this.ellipsis(key)}".`);
    }

    const value = this.dictionaryMap.get(placeholder)!;

    return value;
  }

  private decodeConstant(): null | boolean | number {
    this.index++;

    let value = "";

    while (this.isToken()) {
      value += this.char();

      this.index++;
    }

    switch (value) {
      case "n": {
        return null;

        break;
      }

      case "t": {
        return true;

        break;
      }

      case "f": {
        return false;

        break;
      }

      case "inf": {
        return Infinity;

        break;
      }

      case "ninf": {
        return -Infinity;

        break;
      }

      case "nan": {
        return NaN;

        break;
      }

      default: {
        throw new Error(`Unknown value: ":${this.ellipsis(value)}".`);

        break;
      }
    }
  }

  private decodeString(): string {
    this.index++;

    let value = "";

    const symbols = Symbols.getEscapingSymbols();

    let escaping = false;

    /*

    backslash will escape the next character

    only some characters can be escaped

    if last character is a escaping backslash, throw

    */

    while (escaping || this.isToken()) {
      if (escaping) {
        if (this.isEnded()) {
          throw new Error(
            `Unexpected end of string: "&${this.ellipsis(`${value}\\`)}"`
          );
        }

        if (!symbols.includes(this.char())) {
          throw new Error(`Unexpected escaped character: "\\${this.char()}".`);
        }
      }

      if (!escaping && this.char() === "\\") {
        escaping = true;
      } else {
        escaping = false;

        value += this.char();
      }

      this.index++;
    }

    return value;
  }

  private decodeNumber(): number {
    this.index++;

    let value = "";

    while (this.isToken()) {
      value += this.char();

      this.index++;
    }

    const regex = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?(?:0|[1-9]\d*))?$/;

    if (!regex.test(value)) {
      throw new Error(`Unexpected value: "#${this.ellipsis(value)}".`);
    }

    return Number(value);
  }

  private decodeBigInt(): bigint {
    this.index++;

    let value = "";

    while (this.isToken()) {
      value += this.char();

      this.index++;
    }

    const regex = /^-?(0|[1-9][0-9]*)$/;

    if (!regex.test(value)) {
      throw new Error(`Unexpected value: "%${this.ellipsis(value)}".`);
    }

    return BigInt(value);
  }

  private decodeArray(): any[] {
    this.index++;

    const array: any[] = [];

    while (this.char() !== "]" && !this.isSeparator() && !this.isEnded()) {
      const value = this.decodeToken();

      array.push(value);
    }

    if (this.char() !== "]") {
      throw new Error('Missing character: "]".');
    }

    this.index++;

    return array;
  }

  private decodeObject(): Record<string, any> {
    this.index++;

    const object: Record<string, any> = {};

    let keys: string[] | null = null;

    let i = 0;

    while (this.char() !== "}" && !this.isSeparator() && !this.isEnded()) {
      const value = this.decodeToken();

      // first iteration, assign keys

      if (keys === null) {
        const isString = typeof value === "string";

        const isStringArray =
          Array.isArray(value) &&
          value.length > 1 &&
          value.every((tmpValue): boolean => typeof tmpValue === "string");

        if (!isString && !isStringArray) {
          throw new Error("Invalid key or list of keys in object.");
        }

        keys = isStringArray ? value : [value];

        continue;
      }

      // subsequent iterations, assign values

      object[keys[i]] = value;

      i++;
    }

    if (this.char() !== "}") {
      throw new Error('Missing character: "}".');
    }

    if (keys !== null && keys.length !== i) {
      throw new Error("Unexpected number of values in object.");
    }

    this.index++;

    return object;
  }

  private char(): string {
    return this.source[this.index] ?? "";
  }

  private isSeparator(): boolean {
    return this.char() === "\x00";
  }

  private isEnded(): boolean {
    return this.char() === "";
  }

  private isToken(): boolean {
    return (
      !Symbols.sigils.has(this.char()) &&
      !Symbols.delimiters.has(this.char()) &&
      !this.isSeparator() &&
      !this.isEnded()
    );
  }

  private ellipsis(text: string, limit: number = 12): string {
    if (text.length <= limit) {
      return text;
    }

    return text.substring(0, limit) + "...";
  }
}
