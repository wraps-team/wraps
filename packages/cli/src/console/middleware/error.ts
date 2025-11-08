import type { NextFunction, Request, Response } from "express";

/**
 * Error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error("Server error:", err);

  res.status(500).json({
    error: "Internal server error",
    message: err.message,
  });
}
