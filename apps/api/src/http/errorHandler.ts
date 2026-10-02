import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "./httpError.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Solicitud invalida",
      details: error.flatten()
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: error.code,
      message: error.message
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: process.env.NODE_ENV === "production" ? "Internal server error" : message
  });
};
