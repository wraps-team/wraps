import type { NextFunction, Request, Response } from "express";

/**
 * Token-based authentication middleware
 */
export function authenticateToken(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get token from query param or header
    const token = req.query.token || req.headers["x-auth-token"];

    if (!token || token !== expectedToken) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    next();
  };
}
