import { Symbols } from "./Symbols";

/*

A Tsion string contains tokens such as:

  &hello  &world  {$0$1}

The list of valid sigils and delimiters is defined in `Symbols`.

However, for **encoding purposes only**, we use a different kind of placeholder:
`?0` and `+0`.

The reason for this is that encoded values rely heavily on `match/split` calls.
Using short placeholders like `?0` makes the manipulation of encoded strings more efficient.

*/

export class Encoder {
  private content: string = "";
  private dictionary: string = "";

  private literalMap: Map<string, string> = new Map(); // <?0, &hello>
  private literalPlaceholderMap: Map<string, string> = new Map(); // <&hello, ?0>

  private structureMap: Map<string, string> = new Map(); // <+0, {?0?1}>
  private structurePlaceholderMap: Map<string, string> = new Map(); // <{?0?1}, +0>

  private duplicatePlaceholderMap: Map<string, string> = new Map(); // <?0 | +0, $0>

  public encode(value: any): string {
    let result = "";

    this.content = this.encodeValue(value);

    this.replace();

    if (this.dictionary.length !== 0) {
      result += this.dictionary;
      result += "\x00";
    }

    result += this.content;

    return result;
  }

  private replace(): void {
    const [duplicateLiteralPlaceholders, duplicateStructurePlaceholders] =
      this.findDuplicateEncodingPlaceholders();

    duplicateLiteralPlaceholders.forEach((literalPlaceholder): void => {
      const literal = this.literalMap.get(literalPlaceholder)!;

      this.addDuplicatePlaceholder(literalPlaceholder);

      this.dictionary += literal;
    });

    /*

    Process each structure in the order they were inserted.

    Structures in `structureMap` are added using a depth-first strategy, so
    earlier structures may introduce placeholders that later structures depend on.

    `replaceEncodingPlaceholders()` mutates the meaning of previously-encoded
    structures. Because of this, we update the entry inside `structureMap` ensuring
    that subsequent iterations see the latest, fully-resolved version.

    If a structure placeholder appears in `duplicateStructurePlaceholders`,
    we register that duplicate via `addDuplicatePlaceholder()`.
    This also mutates internal duplicate-placeholder state, which affects
    how the next structures are encoded.

    In short: **each iteration depends on the state produced by all previous
    iterations**, forming a stateful, incremental encoding pipeline.

    The dictionary is also constructed in a depth-first order *because*
    `structureMap` itself is populated in that same depth-first manner. This is
    intentional: during decoding, dictionary entries are consumed sequentially.
    By the time a larger structure is read from the dictionary, all smaller
    structures it depends on have already been decoded and stored, ensuring
    they can be resolved correctly.

    */

    this.structureMap.forEach((structure, structurePlaceholder): void => {
      const replacedStructure = this.replaceEncodingPlaceholders(structure);

      this.structureMap.set(structurePlaceholder, replacedStructure);

      if (!duplicateStructurePlaceholders.has(structurePlaceholder)) {
        return;
      }

      this.addDuplicatePlaceholder(structurePlaceholder);

      this.dictionary += replacedStructure;
    });

    this.content = this.replaceEncodingPlaceholders(this.content);
  }

  private replaceEncodingPlaceholders(source: string): string {
    let result = "";

    const parts = source.split(/([?+]\d+)/g);

    for (const part of parts) {
      const isEncodingPlaceholder = part[0] === "?" || part[0] === "+";

      if (!isEncodingPlaceholder) {
        result += part;

        continue;
      }

      const encodingPlaceholder = part;

      if (this.duplicatePlaceholderMap.has(encodingPlaceholder)) {
        result += this.duplicatePlaceholderMap.get(encodingPlaceholder)!;
      } else {
        if (encodingPlaceholder[0] === "?") {
          result += this.literalMap.get(encodingPlaceholder)!;
        } else {
          result += this.structureMap.get(encodingPlaceholder)!;
        }
      }
    }

    return result;
  }

  private encodeValue(value: any): string {
    if (value === null) {
      return ":n";
    }

    if (typeof value === "boolean") {
      return value ? ":t" : ":f";
    }

    if (typeof value === "string") {
      const symbols = Symbols.getEscapingSymbols();

      const pattern = new RegExp(
        `([${symbols
          .map((s): string => s.replace(/[\\^$*+?.|()[\]{}]/g, "\\$&"))
          .join("")}])`,
        "g"
      );

      const literal = `&${value.replace(pattern, "\\$1")}`;

      const literalPlaceholder = this.addLiteral(literal);

      return literalPlaceholder;
    }

    if (typeof value === "number") {
      if (value === Infinity) {
        return ":inf";
      }

      if (value === -Infinity) {
        return ":ninf";
      }

      if (Number.isNaN(value)) {
        return ":nan";
      }

      const literal = `#${value}`;

      const literalPlaceholder = this.addLiteral(literal);

      return literalPlaceholder;
    }

    if (typeof value === "bigint") {
      const literal = `%${value}`;

      const literalPlaceholder = this.addLiteral(literal);

      return literalPlaceholder;
    }

    if (Array.isArray(value)) {
      let structure = "";

      structure += "[";

      for (const tmpValue of value) {
        structure += this.encodeValue(tmpValue);
      }

      structure += "]";

      const structurePlaceholder = this.addStructure(structure);

      return structurePlaceholder;
    }

    if (typeof value === "object") {
      if (typeof value.toJSON === "function") {
        return this.encodeValue(value.toJSON());
      }

      let structure = "";

      structure += "{";

      const keys = Object.keys(value);

      if (keys.length === 1) {
        const key = keys[0];

        const tmpValue = value[key];

        structure += this.encodeValue(key);
        structure += this.encodeValue(tmpValue);
      } else if (keys.length >= 2) {
        structure += this.encodeValue(keys);

        for (const key of keys) {
          const tmpValue = value[key];

          structure += this.encodeValue(tmpValue);
        }
      }

      structure += "}";

      const structurePlaceholder = this.addStructure(structure);

      return structurePlaceholder;
    }

    return this.encodeValue(null);
  }

  private addLiteral(literal: string): string {
    let literalPlaceholder = this.literalPlaceholderMap.get(literal);

    if (literalPlaceholder === undefined) {
      literalPlaceholder = `?${this.literalMap.size}`;

      this.literalMap.set(literalPlaceholder, literal);
      this.literalPlaceholderMap.set(literal, literalPlaceholder);
    }

    return literalPlaceholder;
  }

  private addStructure(structure: string): string {
    let structurePlaceholder = this.structurePlaceholderMap.get(structure);

    if (structurePlaceholder === undefined) {
      structurePlaceholder = `+${this.structureMap.size}`;

      this.structureMap.set(structurePlaceholder, structure);
      this.structurePlaceholderMap.set(structure, structurePlaceholder);
    }

    return structurePlaceholder;
  }

  private addDuplicatePlaceholder(encodingPlaceholder: string): void {
    const placeholder = `$${this.duplicatePlaceholderMap.size}`;

    this.duplicatePlaceholderMap.set(encodingPlaceholder, placeholder);
  }

  /*

  Scans all structures in `structureMap` to find encoding placeholders
  (e.g. `?3`, `+5`) that appear in more than one structure.

  This works because every entry in `structureMap` is guaranteed to be unique:
  even if the original JavaScript object contains the same structure multiple
  times, we store it only once under its structure placeholder. If that structure
  is referenced elsewhere, it appears again *only* through its placeholder, not
  as a duplicated structure body.

  Because of this uniqueness, seeing the same encoding placeholder inside two or
  more different structures means the placeholder truly occurs multiple times in
  distinct contexts — which qualifies it as a “duplicate” for our encoding logic.

  The method counts all placeholder occurrences, then splits them into two groups:
  - `?n`  → duplicate literal placeholders
  - `+n`  → duplicate structure placeholders

  Both sets are returned so the caller can process them separately.

  */

  private findDuplicateEncodingPlaceholders(): [Set<string>, Set<string>] {
    const encodingPlaceholderCounts: Map<string, number> = new Map();

    this.structureMap.forEach((structure): void => {
      const encodingPlaceholders = structure.match(/[?+]\d+/g) ?? [];

      for (const encodingPlaceholder of encodingPlaceholders) {
        let encodingPlaceholderCount =
          encodingPlaceholderCounts.get(encodingPlaceholder) ?? 0;

        encodingPlaceholderCounts.set(
          encodingPlaceholder,
          encodingPlaceholderCount + 1
        );
      }
    });

    const literalPlaceholders: Set<string> = new Set();
    const structurePlaceholders: Set<string> = new Set();

    encodingPlaceholderCounts.forEach((count, encodingPlaceholder): void => {
      if (count < 2) {
        return;
      }

      if (encodingPlaceholder[0] === "?") {
        literalPlaceholders.add(encodingPlaceholder);
      } else {
        structurePlaceholders.add(encodingPlaceholder);
      }
    });

    return [literalPlaceholders, structurePlaceholders];
  }
}
