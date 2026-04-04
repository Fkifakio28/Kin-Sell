import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "./http-error.js";
import { logger } from "../logger.js";

export const errorHandler = (error: unknown, _request: Request, response: Response, _next: NextFunction): void => {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Donnees invalides",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
    return;
  }

  logger.error({ err: error, path: _request.path, method: _request.method }, "Unhandled error");

  response.status(500).json({ error: "Erreur interne serveur" });
};
