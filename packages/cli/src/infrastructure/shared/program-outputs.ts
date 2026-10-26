import type * as pulumi from "@pulumi/pulumi";

/**
 * What an inline Pulumi program returns: each field may still be an Output,
 * which resolves to T's value once `stack.up()` exports it.
 */
export type ProgramOutputs<T> = { [K in keyof T]: pulumi.Input<T[K]> };
