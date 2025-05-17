import type { CompositionOptions } from "../../types";

import { clone } from "./clone";
import { shallowClone } from "./shallowClone";

export const getCloneFn = (opts: CompositionOptions) => {
  const canUseStructuredClone = typeof structuredClone !== "undefined";

  const cloneFn =
    opts.cloneStrategy === "shallow"
      ? shallowClone
      : opts.cloneStrategy === "structured" && canUseStructuredClone
        ? structuredClone
        : clone;

  return cloneFn;
};
