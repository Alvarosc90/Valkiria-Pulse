import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "validation_error",
      details: error.flatten()
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({
    error: "internal_error",
    message: process.env.NODE_ENV === "production" ? "Internal server error" : message
  });
};
