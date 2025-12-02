import { Encoder } from "./Encoder";
import { Decoder } from "./Decoder";

export class Tsion {
  public static encode(value: any): string {
    const encoder = new Encoder();

    return encoder.encode(value);
  }

  public static decode(source: string): any {
    const decoder = new Decoder();

    return decoder.decode(source);
  }
}
