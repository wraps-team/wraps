import { describe, expect, it, vi } from "vitest";
import { fromPino } from "../logger-contract";

const makePino = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });

describe("fromPino", () => {
  it("puts the error under the err key", () => {
    const pino = makePino();
    const err = new Error("x");

    fromPino(pino).error("msg", err, { a: 1 });

    expect(pino.error).toHaveBeenCalledWith({ err, a: 1 }, "msg");
  });

  it("logs an empty object when there is no error", () => {
    const pino = makePino();

    fromPino(pino).error("msg");

    expect(pino.error).toHaveBeenCalledWith({}, "msg");
  });

  it("passes data through when there is no error", () => {
    const pino = makePino();

    fromPino(pino).error("msg", undefined, { a: 1 });

    expect(pino.error).toHaveBeenCalledWith({ a: 1 }, "msg");
  });

  it("maps info and warn", () => {
    const pino = makePino();
    const logger = fromPino(pino);

    logger.info("msg");
    logger.warn("w", { b: 2 });

    expect(pino.info).toHaveBeenCalledWith({}, "msg");
    expect(pino.warn).toHaveBeenCalledWith({ b: 2 }, "w");
  });
});
